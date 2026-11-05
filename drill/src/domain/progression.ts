// 進級・復習の判定（純粋関数）
import type { FamilySettings } from "./settings";

export interface AttemptLite {
  isCorrect: boolean;
  isGuess: boolean;
  isRetry: boolean;
  fromPrevLevel: boolean;
  responseMs: number;
}

export interface SessionEval {
  /** 判定に使った回答数 */
  total: number;
  correct: number;
  /** 平均解答時間（回答数0なら null） */
  avgMs: number | null;
}

/**
 * 1回の学習の成績。判定に使うのは「1回目の回答」だけ：
 * 間違い直し・当て推量・復習で混ぜた前レベルの問題は除く
 */
export function evaluateSession(attempts: readonly AttemptLite[]): SessionEval {
  const used = attempts.filter((a) => !a.isRetry && !a.isGuess && !a.fromPrevLevel);
  const total = used.length;
  const correct = used.filter((a) => a.isCorrect).length;
  const avgMs = total ? Math.round(used.reduce((s, a) => s + a.responseMs, 0) / total) : null;
  return { total, correct, avgMs };
}

export function accuracy(e: SessionEval): number {
  return e.total ? e.correct / e.total : 0;
}

type JudgeSettings = Pick<
  FamilySettings,
  "promoteSessions" | "promoteAccuracy" | "reviewSessions" | "reviewAccuracy" | "minEvalAnswers"
>;

/** 回答数が少なすぎる回は判定に使わない */
function eligible(recent: readonly SessionEval[], s: JudgeSettings): SessionEval[] {
  return recent.filter((e) => e.total >= s.minEvalAnswers);
}

/**
 * 進級するか。recent は「今のレベルになってから」の完了済みの学習（新しい順）。
 * 直近 promoteSessions 回がすべて 正答率 ≥ promoteAccuracy かつ 平均解答時間 ≤ 目標時間 なら進級
 */
export function shouldPromote(recent: readonly SessionEval[], targetMs: number, s: JudgeSettings): boolean {
  const list = eligible(recent, s).slice(0, s.promoteSessions);
  if (list.length < s.promoteSessions) return false;
  return list.every((e) => accuracy(e) >= s.promoteAccuracy && e.avgMs !== null && e.avgMs <= targetMs);
}

/**
 * 復習（前のレベルの問題を混ぜる）にするか。
 * 直近 reviewSessions 回が続けて 正答率 < reviewAccuracy なら復習。
 * 復習中の回で正答率が戻れば、次の回から自動で解除される
 */
export function shouldReviewMix(recent: readonly SessionEval[], s: JudgeSettings): boolean {
  const list = eligible(recent, s).slice(0, s.reviewSessions);
  if (list.length < s.reviewSessions) return false;
  return list.every((e) => accuracy(e) < s.reviewAccuracy);
}

/** 復習モードのとき、次の問題を前のレベルから出すか */
export function pickFromPrevLevel(reviewMix: boolean, hasPrevLevel: boolean, ratio: number, random: number): boolean {
  return reviewMix && hasPrevLevel && random < ratio;
}
