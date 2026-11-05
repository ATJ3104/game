// 学習の流れ（サーバー側）。問題と答えはサーバーだけが持ち、採点もサーバーで行う。
import type { ChildRow } from "./auth";
import { newId } from "./crypto";
import { getChildLevel, getFamilySettings, minutesFor } from "./repo";
import { studyDateOf } from "@/domain/dates";
import { ENABLED_SUBJECTS, type FamilySettings, type Subject } from "@/domain/settings";
import { generateQuestion } from "@/domain/math/generators";
import { getMathLevel, nextMathLevel, prevMathLevel } from "@/domain/math/levels";
import { questionKey, toPublic, type MathQuestion, type PublicQuestion } from "@/domain/math/question";
import { mathRandomRng } from "@/domain/math/rng";
import { answerText, grade, inputText, type AnswerInput, type Feedback } from "@/domain/math/answer";
import {
  evaluateSession,
  pickFromPrevLevel,
  shouldPromote,
  shouldReviewMix,
  type SessionEval,
} from "@/domain/progression";
import {
  clampActiveMs,
  clampResponseMs,
  isGuess,
  nextStatus,
  pendingRetries,
  type SessionStatus,
} from "@/domain/session";

export interface SessionRow {
  id: string;
  child_id: string;
  study_date: string;
  subject: Subject;
  level_code: string;
  active_seconds: number;
  target_seconds: number;
  status: SessionStatus;
  is_review_mix: number;
  current_question_json: string | null;
  current_shown_at: string | null;
  current_retry_of: string | null;
  last_report_at: string | null;
  started_at: string;
  completed_at: string | null;
}

interface StoredQuestion {
  q: MathQuestion;
  fromPrev: boolean;
}

export interface StudyState {
  sessionId: string;
  subject: Subject;
  status: SessionStatus;
  levelCode: string;
  levelName: string;
  activeSeconds: number;
  targetSeconds: number;
  idleSeconds: number;
  question: PublicQuestion | null;
  /** 出題中の問題の識別子（二重送信の防止） */
  qid: string | null;
  isRetry: boolean;
  retryRemaining: number;
  dayCompleted: boolean;
  promotedTo: string | null;
}

export interface AnswerResult {
  correct: boolean;
  feedback?: Feedback;
  correctAnswer: string;
  yourAnswer: string;
  state: StudyState;
}

export class StudyError extends Error {
  constructor(
    public code: "not_found" | "stale" | "done" | "expired" | "invalid",
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** 前日に始めた学習を、日の区切りの後どれだけ続けてよいか */
const CARRY_OVER_MS = 3 * 60 * 60 * 1000;

async function loadSettings(db: D1Database, child: ChildRow): Promise<FamilySettings> {
  return getFamilySettings(db, child.family_id);
}

export function todayFor(settings: FamilySettings, now = new Date()): string {
  return studyDateOf(now, settings.dayBoundaryHour);
}

/** 今のレベルになってから完了した学習の成績（新しい順） */
async function recentEvals(db: D1Database, childId: string, subject: Subject, level: string): Promise<SessionEval[]> {
  const since = await db
    .prepare(
      "SELECT MAX(created_at) AS t FROM level_history WHERE child_id = ? AND subject = ? AND to_level = ? AND from_level IS NOT to_level",
    )
    .bind(childId, subject, level)
    .first<{ t: string | null }>();
  const res = await db
    .prepare(
      `SELECT eval_total, eval_correct, eval_avg_ms FROM sessions
        WHERE child_id = ? AND subject = ? AND level_code = ? AND completed_at IS NOT NULL
          AND started_at >= ?
        ORDER BY completed_at DESC LIMIT 20`,
    )
    .bind(childId, subject, level, since?.t ?? "")
    .all<{ eval_total: number; eval_correct: number; eval_avg_ms: number | null }>();
  return res.results.map((r) => ({ total: r.eval_total, correct: r.eval_correct, avgMs: r.eval_avg_ms }));
}

async function retryQueue(db: D1Database, sessionId: string): Promise<string[]> {
  const rows = await db
    .prepare("SELECT id, is_correct, is_retry, retry_of, created_at FROM attempts WHERE session_id = ? ORDER BY created_at")
    .bind(sessionId)
    .all<{ id: string; is_correct: number; is_retry: number; retry_of: string | null; created_at: string }>();
  const originals = rows.results
    .filter((r) => r.is_retry === 0 && r.is_correct === 0)
    .map((r) => ({ id: r.id, createdAt: r.created_at }));
  const retries = rows.results
    .filter((r) => r.is_retry === 1 && r.retry_of)
    .map((r) => ({ retryOf: r.retry_of!, isCorrect: r.is_correct === 1, createdAt: r.created_at }));
  return pendingRetries(originals, retries);
}

/** 新しい問題を作る（復習モードなら前のレベルを3割混ぜる。直前と同じ問題は避ける） */
async function newQuestion(db: D1Database, s: SessionRow, settings: FamilySettings): Promise<StoredQuestion> {
  const last = await db
    .prepare("SELECT question_json FROM attempts WHERE session_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(s.id)
    .first<{ question_json: string }>();
  const lastKey = last ? questionKey((JSON.parse(last.question_json) as StoredQuestion).q) : null;
  const prev = prevMathLevel(s.level_code);
  const fromPrev = pickFromPrevLevel(s.is_review_mix === 1, prev !== null, settings.reviewMixRatio, Math.random());
  const level = fromPrev && prev ? prev : s.level_code;
  let q = generateQuestion(level, mathRandomRng);
  for (let i = 0; i < 5 && questionKey(q) === lastKey; i++) q = generateQuestion(level, mathRandomRng);
  return { q, fromPrev };
}

async function setCurrentQuestion(
  db: D1Database,
  sessionId: string,
  stored: StoredQuestion | null,
  retryOf: string | null,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      "UPDATE sessions SET current_question_json = ?, current_shown_at = ?, current_retry_of = ? WHERE id = ?",
    )
    .bind(stored ? JSON.stringify(stored) : null, stored ? now.toISOString() : null, retryOf, sessionId)
    .run();
}

/** 間違い直しの問題を出す（元の問題をそのまま再出題） */
async function retryQuestion(db: D1Database, attemptId: string): Promise<StoredQuestion> {
  const row = await db
    .prepare("SELECT question_json FROM attempts WHERE id = ?")
    .bind(attemptId)
    .first<{ question_json: string }>();
  return JSON.parse(row!.question_json) as StoredQuestion;
}

async function isDayCompleted(db: D1Database, childId: string, date: string): Promise<boolean> {
  return !!(await db
    .prepare("SELECT 1 FROM daily_completion WHERE child_id = ? AND study_date = ?")
    .bind(childId, date)
    .first());
}

async function toState(
  db: D1Database,
  s: SessionRow,
  settings: FamilySettings,
  extra: { promotedTo?: string | null } = {},
): Promise<StudyState> {
  const stored = s.current_question_json ? (JSON.parse(s.current_question_json) as StoredQuestion) : null;
  const queue = s.status === "studying" ? [] : await retryQueue(db, s.id);
  return {
    sessionId: s.id,
    subject: s.subject,
    status: s.status,
    levelCode: s.level_code,
    levelName: getMathLevel(s.level_code)?.name ?? s.level_code,
    activeSeconds: Math.floor(s.active_seconds),
    targetSeconds: s.target_seconds,
    idleSeconds: settings.idleSeconds,
    question: stored && s.status !== "done" ? toPublic(stored.q) : null,
    qid: s.status !== "done" ? s.current_shown_at : null,
    isRetry: s.current_retry_of !== null,
    retryRemaining: queue.length,
    dayCompleted: await isDayCompleted(db, s.child_id, s.study_date),
    promotedTo: extra.promotedTo ?? null,
  };
}

async function getSession(db: D1Database, childId: string, sessionId: string): Promise<SessionRow> {
  const s = await db
    .prepare("SELECT * FROM sessions WHERE id = ? AND child_id = ?")
    .bind(sessionId, childId)
    .first<SessionRow>();
  if (!s) throw new StudyError("not_found");
  return s;
}

/** 今日のその教科の学習を始める（すでにあれば続きから） */
export async function startOrResume(db: D1Database, child: ChildRow, subject: Subject): Promise<StudyState> {
  if (!ENABLED_SUBJECTS.includes(subject)) throw new StudyError("invalid", "この教科はまだありません");
  const settings = await loadSettings(db, child);
  const now = new Date();
  const today = todayFor(settings, now);

  let s = await db
    .prepare("SELECT * FROM sessions WHERE child_id = ? AND study_date = ? AND subject = ?")
    .bind(child.id, today, subject)
    .first<SessionRow>();

  if (!s) {
    const level = (await getChildLevel(db, child.id, subject)) ?? "M01";
    const review = shouldReviewMix(await recentEvals(db, child.id, subject, level), settings) && prevMathLevel(level) !== null;
    const id = newId();
    const stmts = [
      db
        .prepare(
          `INSERT INTO sessions (id, child_id, study_date, subject, level_code, target_seconds, is_review_mix, started_at, last_report_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(child_id, study_date, subject) DO NOTHING`,
        )
        .bind(id, child.id, today, subject, level, minutesFor(child, subject) * 60, review ? 1 : 0, now.toISOString(), now.toISOString()),
    ];
    if (review) {
      // 復習が始まったことを記録（レベルは変わらない）
      const lastWasReview = await db
        .prepare(
          "SELECT is_review_mix FROM sessions WHERE child_id = ? AND subject = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
        )
        .bind(child.id, subject)
        .first<{ is_review_mix: number }>();
      if (!lastWasReview?.is_review_mix) {
        stmts.push(
          db
            .prepare(
              "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, ?, ?, ?, 'auto_review', ?)",
            )
            .bind(newId(), child.id, subject, level, level, now.toISOString()),
        );
      }
    }
    await db.batch(stmts);
    s = await db
      .prepare("SELECT * FROM sessions WHERE child_id = ? AND study_date = ? AND subject = ?")
      .bind(child.id, today, subject)
      .first<SessionRow>();
    if (!s) throw new StudyError("not_found");
  }

  if (s.status !== "done" && !s.current_question_json) {
    const next = await newQuestion(db, s, settings);
    await setCurrentQuestion(db, s.id, next, null, now);
    s = { ...s, current_question_json: JSON.stringify(next), current_shown_at: now.toISOString(), current_retry_of: null };
  }
  // 再開時は「最後の報告」を今にする（閉じていた間を数えない）
  await db.prepare("UPDATE sessions SET last_report_at = ? WHERE id = ?").bind(now.toISOString(), s.id).run();
  return toState(db, s, settings);
}

function assertActive(s: SessionRow, today: string, now: Date): void {
  if (s.status === "done") throw new StudyError("done");
  if (s.study_date !== today && now.getTime() - Date.parse(s.started_at) > CARRY_OVER_MS) {
    throw new StudyError("expired", "日付がかわりました");
  }
}

/** 時間の報告だけ（問題を解いている途中の定期送信） */
export async function heartbeat(
  db: D1Database,
  child: ChildRow,
  sessionId: string,
  activeMs: unknown,
): Promise<{ activeSeconds: number; targetSeconds: number }> {
  const settings = await loadSettings(db, child);
  const now = new Date();
  const s = await getSession(db, child.id, sessionId);
  if (s.status === "done") return { activeSeconds: Math.floor(s.active_seconds), targetSeconds: s.target_seconds };
  assertActive(s, todayFor(settings, now), now);
  const add = clampActiveMs(activeMs, s.last_report_at, now) / 1000;
  await db
    .prepare("UPDATE sessions SET active_seconds = active_seconds + ?, last_report_at = ? WHERE id = ?")
    .bind(add, now.toISOString(), s.id)
    .run();
  return { activeSeconds: Math.floor(s.active_seconds + add), targetSeconds: s.target_seconds };
}

/** 回答を採点し、次の問題（または間違い直し・完了）へ進める */
export async function submitAnswer(
  db: D1Database,
  child: ChildRow,
  p: { sessionId: string; qid: string; input: AnswerInput; responseMs: unknown; activeMs: unknown },
): Promise<AnswerResult> {
  const settings = await loadSettings(db, child);
  const now = new Date();
  const s = await getSession(db, child.id, p.sessionId);
  assertActive(s, todayFor(settings, now), now);
  if (!s.current_question_json || s.current_shown_at !== p.qid) throw new StudyError("stale");

  const stored = JSON.parse(s.current_question_json) as StoredQuestion;
  const result = grade(stored.q, p.input);
  if (result.invalid) throw new StudyError("invalid", "こたえを いれてね");

  const responseMs = clampResponseMs(p.responseMs, s.current_shown_at, now);
  const addSeconds = clampActiveMs(p.activeMs, s.last_report_at, now) / 1000;
  const isRetry = s.current_retry_of !== null;

  // この問題を「回答済み」にする。qid が一致したときだけ更新できる（二重送信の防止）
  const claim = await db
    .prepare(
      `UPDATE sessions SET current_question_json = NULL, current_shown_at = NULL, current_retry_of = NULL,
              active_seconds = active_seconds + ?, last_report_at = ?
        WHERE id = ? AND current_shown_at = ?`,
    )
    .bind(addSeconds, now.toISOString(), s.id, p.qid)
    .run();
  if (!claim.meta.changes) throw new StudyError("stale");

  await db
    .prepare(
      `INSERT INTO attempts (id, session_id, question_json, answer, is_correct, response_ms, is_guess, is_retry, retry_of, from_prev_level, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      s.id,
      s.current_question_json,
      inputText(p.input),
      result.correct ? 1 : 0,
      responseMs,
      isGuess(responseMs, settings.guessThresholdMs[s.subject]) ? 1 : 0,
      isRetry ? 1 : 0,
      s.current_retry_of,
      stored.fromPrev ? 1 : 0,
      now.toISOString(),
    )
    .run();

  const activeSeconds = s.active_seconds + addSeconds;
  const queue = await retryQueue(db, s.id);
  const status = nextStatus({ status: s.status, activeSeconds, targetSeconds: s.target_seconds, pendingRetries: queue.length });
  let updated: SessionRow = { ...s, active_seconds: activeSeconds, status, current_question_json: null, current_shown_at: null, current_retry_of: null };
  let promotedTo: string | null = null;

  if (status === "done") {
    promotedTo = await completeSession(db, child, updated, settings, now);
    updated = { ...updated, completed_at: now.toISOString() };
  } else {
    // 次の問題。間違い直しは「最後に出した時刻が古い順」なので、今まちがえた問題はうしろに回る
    const next: StoredQuestion =
      status === "retry" ? await retryQuestion(db, queue[0]!) : await newQuestion(db, updated, settings);
    const retryOf = status === "retry" ? queue[0]! : null;
    const shownAt = new Date(Math.max(now.getTime() + 1, Date.parse(s.current_shown_at!) + 1));
    await db
      .prepare(
        "UPDATE sessions SET status = ?, current_question_json = ?, current_shown_at = ?, current_retry_of = ? WHERE id = ?",
      )
      .bind(status, JSON.stringify(next), shownAt.toISOString(), retryOf, s.id)
      .run();
    updated = {
      ...updated,
      current_question_json: JSON.stringify(next),
      current_shown_at: shownAt.toISOString(),
      current_retry_of: retryOf,
    };
  }

  return {
    correct: result.correct,
    feedback: result.feedback,
    correctAnswer: answerText(stored.q),
    yourAnswer: inputText(p.input),
    state: await toState(db, updated, settings, { promotedTo }),
  };
}

/** 教科の完了：成績を確定し、1日の達成と進級を判定する。進級したら新しいレベルを返す */
async function completeSession(
  db: D1Database,
  child: ChildRow,
  s: SessionRow,
  settings: FamilySettings,
  now: Date,
): Promise<string | null> {
  const rows = await db
    .prepare("SELECT is_correct, is_guess, is_retry, from_prev_level, response_ms FROM attempts WHERE session_id = ?")
    .bind(s.id)
    .all<{ is_correct: number; is_guess: number; is_retry: number; from_prev_level: number; response_ms: number }>();
  const ev = evaluateSession(
    rows.results.map((r) => ({
      isCorrect: r.is_correct === 1,
      isGuess: r.is_guess === 1,
      isRetry: r.is_retry === 1,
      fromPrevLevel: r.from_prev_level === 1,
      responseMs: r.response_ms,
    })),
  );
  const iso = now.toISOString();
  await db
    .prepare(
      "UPDATE sessions SET status = 'done', completed_at = ?, eval_total = ?, eval_correct = ?, eval_avg_ms = ? WHERE id = ?",
    )
    .bind(iso, ev.total, ev.correct, ev.avgMs, s.id)
    .run();

  // その日の教科がすべて終わっていれば「達成」
  const done = await db
    .prepare("SELECT subject FROM sessions WHERE child_id = ? AND study_date = ? AND status = 'done'")
    .bind(child.id, s.study_date)
    .all<{ subject: Subject }>();
  const doneSet = new Set(done.results.map((r) => r.subject));
  if (ENABLED_SUBJECTS.every((sub) => doneSet.has(sub))) {
    await db
      .prepare("INSERT INTO daily_completion (child_id, study_date, completed_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
      .bind(child.id, s.study_date, iso)
      .run();
  }

  // 進級判定（親が途中でレベルを変えていたら判定しない）
  const current = await getChildLevel(db, child.id, s.subject);
  if (current !== s.level_code) return null;
  const level = getMathLevel(s.level_code);
  const next = nextMathLevel(s.level_code);
  if (!level || !next) return null;
  const evals = await recentEvals(db, child.id, s.subject, s.level_code);
  if (!shouldPromote(evals, level.targetMs, settings)) return null;
  await db.batch([
    db
      .prepare("UPDATE child_levels SET level_code = ?, updated_at = ? WHERE child_id = ? AND subject = ?")
      .bind(next, iso, child.id, s.subject),
    db
      .prepare(
        "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, ?, ?, ?, 'auto_up', ?)",
      )
      .bind(newId(), child.id, s.subject, s.level_code, next, iso),
  ]);
  return next;
}
