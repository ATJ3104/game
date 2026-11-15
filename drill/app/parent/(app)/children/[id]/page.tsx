import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { childSubjects, getChildOfFamily, getFamilySettings, minutesFor } from "@/server/repo";
import { loadRecords, monthLabel, monthSummary, streakOf } from "@/server/summary";
import { recentEvals } from "@/server/study";
import { levelOptions } from "@/server/contentPolicy";
import { addDays, addMonths, isValidDate, studyDateOf, weekdayOf, yearMonthOf } from "@/domain/dates";
import { availableLevels, getLevel, levelIndex } from "@/domain/levels";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";
import { mistakeStats } from "@/domain/math/categories";
import { answerText } from "@/domain/math/answer";
import type { MathQuestion } from "@/domain/math/question";
import { promotionProgress, questionText, subjectDayReport, type AttemptRow } from "@/domain/progressReport";
import { questionQuota } from "@/domain/session";
import { MonthCalendar } from "@/ui/MonthCalendar";

export const dynamic = "force-dynamic";

const REASON = { initial: "初期設定", auto_up: "自動で進級", auto_review: "復習を開始", manual: "手動で変更" } as const;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const STATUS = { studying: "学習中", retry: "まちがい直し中", done: "✅ 完了" } as const;
const SUBJECT_LABEL_KANJI: Record<Subject, string> = { math: "算数", japanese: "国語", english: "英語" };

const dayLabel = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}（${WEEK[weekdayOf(d)]}）`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export default async function ChildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ym?: string; date?: string }>;
}) {
  const { parent } = await requireParentPage();
  const { id } = await params;
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, id);
  if (!child) notFound();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const sp = await searchParams;
  const ym = sp.ym && /^\d{4}-\d{2}$/.test(sp.ym) ? sp.ym : yearMonthOf(today);
  // くわしく見る日（指定がなければ今日）
  const date = sp.date && isValidDate(sp.date) && sp.date <= today ? sp.date : today;
  const from14 = addDays(today, -13);

  const [rec, history, subjects, levelRows, daySessions, dayAttempts, twoWeeks, month30] = await Promise.all([
    loadRecords(db, child.id),
    db
      .prepare(
        "SELECT subject, from_level, to_level, reason, created_at FROM level_history WHERE child_id = ? ORDER BY created_at DESC LIMIT 40",
      )
      .bind(child.id)
      .all<{ subject: Subject; from_level: string | null; to_level: string; reason: keyof typeof REASON; created_at: string }>(),
    childSubjects(db, child.id),
    db
      .prepare("SELECT subject, level_code FROM child_levels WHERE child_id = ?")
      .bind(child.id)
      .all<{ subject: Subject; level_code: string }>(),
    db
      .prepare(
        "SELECT id, subject, level_code, status, active_seconds, target_seconds, target_questions, answered FROM sessions WHERE child_id = ? AND study_date = ?",
      )
      .bind(child.id, date)
      .all<{
        id: string;
        subject: Subject;
        level_code: string;
        status: keyof typeof STATUS;
        active_seconds: number;
        target_seconds: number;
        target_questions: number | null;
        answered: number;
      }>(),
    db
      .prepare(
        `SELECT a.id, a.session_id, a.question_json, a.answer, a.is_correct, a.is_retry, a.is_guess, a.retry_of
           FROM attempts a JOIN sessions s ON s.id = a.session_id
          WHERE s.child_id = ? AND s.study_date = ? ORDER BY a.created_at`,
      )
      .bind(child.id, date)
      .all<{
        id: string;
        session_id: string;
        question_json: string;
        answer: string;
        is_correct: number;
        is_retry: number;
        is_guess: number;
        retry_of: string | null;
      }>(),
    db
      .prepare(
        `SELECT s.study_date, s.subject, s.level_code, s.status, s.active_seconds,
                SUM(CASE WHEN a.is_retry = 0 THEN 1 ELSE 0 END) AS n,
                SUM(CASE WHEN a.is_retry = 0 AND a.is_correct = 1 THEN 1 ELSE 0 END) AS ok
           FROM sessions s LEFT JOIN attempts a ON a.session_id = s.id
          WHERE s.child_id = ? AND s.study_date >= ?
          GROUP BY s.id ORDER BY s.study_date DESC`,
      )
      .bind(child.id, from14)
      .all<{ study_date: string; subject: Subject; level_code: string; status: string; active_seconds: number; n: number | null; ok: number | null }>(),
    db
      .prepare(
        `SELECT a.question_json, a.is_correct, a.answer FROM attempts a JOIN sessions s ON s.id = a.session_id
          WHERE s.child_id = ? AND s.study_date >= ? AND a.is_retry = 0 AND a.is_guess = 0
          ORDER BY a.created_at DESC LIMIT 2000`,
      )
      .bind(child.id, addDays(today, -29))
      .all<{ question_json: string; is_correct: number; answer: string }>(),
  ]);

  const parseQ = (json: string) => (JSON.parse(json) as { q: MathQuestion }).q;
  const levelOf = (s: Subject) => levelRows.results.find((l) => l.subject === s)?.level_code ?? "";
  const opts = levelOptions();

  // その日の教科ごとのまとめ
  const dayCards = subjects.map((subject) => {
    const session = daySessions.results.find((s) => s.subject === subject);
    const rows: AttemptRow[] = dayAttempts.results
      .filter((a) => a.session_id === session?.id)
      .map((a) => {
        const q = parseQ(a.question_json);
        return {
          id: a.id,
          q,
          answer: a.answer,
          correctAnswer: answerText(q),
          isCorrect: a.is_correct === 1,
          isRetry: a.is_retry === 1,
          isGuess: a.is_guess === 1,
          retryOf: a.retry_of,
        };
      });
    const level = session?.level_code ?? levelOf(subject);
    const quota = session
      ? (session.target_questions ?? questionQuota(session.target_seconds, getLevel(subject, level)?.targetMs ?? 5000))
      : questionQuota(minutesFor(child, subject) * 60, getLevel(subject, level)?.targetMs ?? 5000);
    return { subject, session, level, quota, report: subjectDayReport(rows) };
  });

  // 進級までの様子（今のレベル）
  const promo = await Promise.all(
    subjects.map(async (subject) => {
      const level = levelOf(subject);
      const info = getLevel(subject, level);
      const total = availableLevels(subject, opts).length;
      return {
        subject,
        level,
        name: info?.name ?? "",
        position: levelIndex(subject, level, opts) + 1,
        total,
        progress: promotionProgress(await recentEvals(db, child.id, subject, level), info?.targetMs ?? 5000, settings),
      };
    }),
  );

  // 直近2週間（日ごと・教科ごと）
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i)).filter((d) => d >= child.start_date);
  const cell = (d: string, s: Subject) => twoWeeks.results.find((r) => r.study_date === d && r.subject === s);

  const month = monthSummary(child, settings, rec, ym, today);
  const mistakes = mistakeStats(
    month30.results.map((a) => {
      const q = parseQ(a.question_json);
      return { q, isCorrect: a.is_correct === 1, text: `${questionText(q)} → ${a.answer}（×）` };
    }),
  ).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{child.name}</h1>
        <Link href="/parent" className="text-sm text-gray-500 underline">
          もどる
        </Link>
      </div>
      <p className="text-sm text-gray-600">
        連続 {streakOf(child, settings, rec, today)}日・これまでの達成 {rec.completed.size}日
      </p>

      {/* ---- その日にやったこと ---- */}
      <section className="space-y-3" data-testid="day-report">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {date === today ? "今日" : dayLabel(date)}にやったこと
            {date === today && <span className="ml-2 text-sm font-normal text-gray-500">{dayLabel(date)}</span>}
          </h2>
          {date !== today && (
            <Link href="?" className="text-sm font-bold text-amber-700 underline">
              今日にもどる
            </Link>
          )}
        </div>
        {dayCards.map(({ subject, session, level, quota, report }) => (
          <div key={subject} className="space-y-3 rounded-2xl border p-4" data-testid={`report-${subject}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                {SUBJECT_LABEL_KANJI[subject]}
                <span className="ml-2 text-xs font-normal text-gray-500">
                  {level} {getLevel(subject, level)?.name}
                </span>
              </span>
              <span className={`shrink-0 text-sm font-bold ${session?.status === "done" ? "text-green-700" : session ? "text-sky-700" : "text-gray-400"}`}>
                {session ? STATUS[session.status] : "まだ"}
              </span>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums" data-testid="answered">
                  {session?.answered ?? 0}
                </span>
                <span className="text-sm text-gray-600">問 ／ きょうの分 {quota}問</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${session?.status === "done" ? "bg-green-500" : "bg-amber-400"}`}
                  style={{ width: `${Math.min(100, pct(session?.answered ?? 0, quota))}%` }}
                />
              </div>
            </div>

            {report.answered > 0 && (
              <>
                <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
                  <div className="rounded-xl bg-green-50 p-2">
                    <div className="text-lg font-bold text-green-700">{report.correct}問</div>
                    正解（{pct(report.correct, report.answered)}%）
                  </div>
                  <div className="rounded-xl bg-rose-50 p-2">
                    <div className="text-lg font-bold text-rose-700">{report.wrong}問</div>
                    まちがい
                  </div>
                  <div className="rounded-xl bg-gray-50 p-2">
                    <div className="text-lg font-bold text-gray-800">
                      {report.fixed}/{report.wrong}問
                    </div>
                    直した
                  </div>
                </div>

                <div>
                  <h3 className="mb-1 text-xs font-bold text-gray-500">内訳</h3>
                  <ul className="space-y-1 text-sm">
                    {report.categories.map((c) => (
                      <li key={c.name} className="flex items-center gap-2">
                        <span className="w-28 shrink-0 truncate">{c.name}</span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-rose-200">
                          <span className="block h-full bg-green-500" style={{ width: `${pct(c.correct, c.answered)}%` }} />
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums text-gray-600">
                          {c.answered}問中 {c.correct}問
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {report.mistakes.length > 0 && (
                  <details>
                    <summary className="min-h-10 cursor-pointer py-2 text-sm font-bold text-rose-700">
                      まちがえた問題を見る（{report.mistakes.length}問）
                    </summary>
                    <ul className="space-y-1 text-sm">
                      {report.mistakes.map((m, i) => (
                        <li key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                          <div>{m.text}</div>
                          <div className="text-xs text-gray-600">
                            こたえた：<span className="text-rose-700">{m.answer || "（なし）"}</span>　正解：
                            <span className="font-bold text-green-700">{m.correctAnswer}</span>
                            {m.fixed ? "　✅ 直した" : ""}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {report.answered !== (session?.answered ?? 0) && (
                  <p className="text-xs text-amber-700">
                    回答は全部で {report.answered}問。そのうち速すぎるまちがい（1秒未満）の {report.answered - (session?.answered ?? 0)}問は、きょうの分に数えていません。
                  </p>
                )}
                <p className="text-xs text-gray-500">学習時間 {Math.round((session?.active_seconds ?? 0) / 60)}分</p>
              </>
            )}
          </div>
        ))}
        {dayCards.length === 0 && <p className="text-sm text-gray-500">学習する教科が設定されていません。</p>}
      </section>

      {/* ---- レベルと進級 ---- */}
      <section className="space-y-3 rounded-2xl border p-4" data-testid="promotion">
        <h2 className="font-bold">いまのレベルと進級まで</h2>
        {promo.map((p) => (
          <div key={p.subject} className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">
                {SUBJECT_LABEL_KANJI[p.subject]} {p.level}
                <span className="ml-1 text-xs font-normal text-gray-500">{p.name}</span>
              </span>
              <span className="shrink-0 text-xs text-gray-500">
                {p.position} / {p.total} レベル
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div className="h-full bg-amber-400" style={{ width: `${pct(p.position, p.total)}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <span>
                進級まで：{p.progress.streak} / {p.progress.needed} 回クリア
              </span>
              {p.progress.checks.map((c, i) => (
                <span
                  key={i}
                  className={`rounded-full px-2 py-0.5 ${c.pass ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}
                  title={i === 0 ? "いちばん新しい回" : ""}
                >
                  {c.pass ? "○" : "△"} {c.accuracyPct}%・{c.avgSeconds ?? "—"}秒
                </span>
              ))}
              {p.progress.checks.length === 0 && <span>（このレベルでの完了した回はまだありません）</span>}
            </div>
            <p className="text-xs text-gray-500">
              条件：正答率 {p.progress.accuracyPct}%以上・平均 {p.progress.targetSeconds}秒以内を {p.progress.needed}回続ける
            </p>
          </div>
        ))}
      </section>

      {/* ---- 日ごとの記録 ---- */}
      <section className="rounded-2xl border p-4" data-testid="daily-table">
        <h2 className="mb-2 font-bold">日ごとの記録（直近2週間）</h2>
        <p className="mb-2 text-xs text-gray-500">解いた問題数（正答率）とレベル。日付を押すと、その日のくわしい内容を見られます。</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-gray-500">
                <th className="py-1 pr-2 font-normal">日</th>
                {subjects.map((s) => (
                  <th key={s} className="py-1 pr-2 font-normal">
                    {SUBJECT_LABEL_KANJI[s]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className={`border-b last:border-0 ${d === date ? "bg-amber-50" : ""}`}>
                  <td className="py-2 pr-2">
                    <Link href={`?date=${d}`} className="font-bold text-amber-700 underline">
                      {dayLabel(d)}
                    </Link>
                    <span className="ml-1 text-xs">
                      {rec.completed.has(d) ? "⭐" : rec.special.has(d) ? "🌙" : ""}
                    </span>
                  </td>
                  {subjects.map((s) => {
                    const c = cell(d, s);
                    return (
                      <td key={s} className="py-2 pr-2 tabular-nums">
                        {c && (c.n ?? 0) > 0 ? (
                          <>
                            <span className="font-bold">{c.n}問</span>
                            <span className="text-xs text-gray-600">（{pct(c.ok ?? 0, c.n ?? 0)}%）</span>
                            <div className="text-xs text-gray-500">
                              {c.level_code}
                              {c.status !== "done" ? "・途中" : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border p-4">
        <div className="mb-3 flex items-center justify-between">
          <Link href={`?ym=${addMonths(ym, -1)}`} className="min-h-12 px-3 py-3 font-bold text-amber-700">
            ◀
          </Link>
          <h2 className="font-bold">{monthLabel(ym)}</h2>
          <Link href={`?ym=${addMonths(ym, 1)}`} className="min-h-12 px-3 py-3 font-bold text-amber-700">
            ▶
          </Link>
        </div>
        <MonthCalendar days={month.days} compact />
        <p className="mt-2 text-sm text-gray-600">
          達成 {month.achievedDays}日・お休み券 {month.ticketsUsed}/{settings.ticketsPerMonth}枚・特別休み {month.specialDays}日・未達成{" "}
          {month.missedCount}日
        </p>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-bold">よく間違える問題の種類（直近30日）</h2>
        {mistakes.length === 0 && <p className="text-sm text-gray-500">目立つ間違いはありません</p>}
        <ul className="space-y-2 text-sm">
          {mistakes.map((m) => (
            <li key={m.category}>
              <div className="font-bold">
                {m.category}：{m.total}問中 {m.wrong}問まちがい（{pct(m.wrong, m.total)}%）
              </div>
              <div className="text-gray-500">{m.examples.join("　")}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-bold">レベルの推移</h2>
        <ul className="space-y-1 text-sm">
          {history.results.map((h, i) => (
            <li key={i}>
              {new Date(h.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}
              {SUBJECT_LABEL[h.subject]} {h.from_level && h.from_level !== h.to_level ? `${h.from_level} → ` : ""}
              {h.to_level}（{REASON[h.reason] ?? h.reason}）
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">レベルの手動変更は「設定」からできます。</p>
      </section>
    </div>
  );
}
