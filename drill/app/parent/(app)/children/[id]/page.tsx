import Link from "next/link";
import { notFound } from "next/navigation";
import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getChildOfFamily, getFamilySettings } from "@/server/repo";
import { loadRecords, monthLabel, monthSummary, streakOf } from "@/server/summary";
import { addDays, addMonths, studyDateOf, yearMonthOf } from "@/domain/dates";
import { getMathLevel } from "@/domain/math/levels";
import { mistakeStats } from "@/domain/math/categories";
import type { MathQuestion } from "@/domain/math/question";
import { MonthCalendar } from "@/ui/MonthCalendar";

export const dynamic = "force-dynamic";

const REASON = { initial: "初期設定", auto_up: "自動で進級", auto_review: "復習を開始", manual: "手動で変更" } as const;

export default async function ChildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ym?: string }>;
}) {
  const { parent } = await requireParentPage();
  const { id } = await params;
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, id);
  if (!child) notFound();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const ymParam = (await searchParams).ym;
  const ym = ymParam && /^\d{4}-\d{2}$/.test(ymParam) ? ymParam : yearMonthOf(today);
  const since = addDays(today, -29);

  const [rec, history, daily, attempts, level] = await Promise.all([
    loadRecords(db, child.id),
    db
      .prepare(
        "SELECT from_level, to_level, reason, created_at FROM level_history WHERE child_id = ? AND subject = 'math' ORDER BY created_at DESC LIMIT 30",
      )
      .bind(child.id)
      .all<{ from_level: string | null; to_level: string; reason: keyof typeof REASON; created_at: string }>(),
    db
      .prepare(
        `SELECT study_date, SUM(active_seconds) AS sec, MAX(eval_total) AS total, MAX(eval_correct) AS correct
           FROM sessions WHERE child_id = ? AND study_date >= ? GROUP BY study_date ORDER BY study_date DESC`,
      )
      .bind(child.id, addDays(today, -13))
      .all<{ study_date: string; sec: number; total: number | null; correct: number | null }>(),
    db
      .prepare(
        `SELECT a.question_json, a.is_correct, a.answer FROM attempts a JOIN sessions s ON s.id = a.session_id
          WHERE s.child_id = ? AND s.study_date >= ? AND a.is_retry = 0 AND a.is_guess = 0
          ORDER BY a.created_at DESC LIMIT 2000`,
      )
      .bind(child.id, since)
      .all<{ question_json: string; is_correct: number; answer: string }>(),
    db
      .prepare("SELECT level_code FROM child_levels WHERE child_id = ? AND subject = 'math'")
      .bind(child.id)
      .first<{ level_code: string }>(),
  ]);
  const month = monthSummary(child, settings, rec, ym, today);
  const mistakes = mistakeStats(
    attempts.results.map((a) => {
      const q = (JSON.parse(a.question_json) as { q: MathQuestion }).q;
      const text = q.tokens.map((t) => (t.t === "f" ? `${t.n}/${t.d}` : t.v)).join(" ");
      return { q, isCorrect: a.is_correct === 1, text: `${text} ${a.answer}（×）` };
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
        算数 {level?.level_code}（{getMathLevel(level?.level_code ?? "")?.name}）・連続 {streakOf(child, settings, rec, today)}日・これまでの達成{" "}
        {rec.completed.size}日
      </p>

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
        <h2 className="mb-2 font-bold">1日の学習時間（直近2週間）</h2>
        {daily.results.length === 0 && <p className="text-sm text-gray-500">記録がありません</p>}
        <ul className="space-y-1 text-sm">
          {daily.results.map((d) => (
            <li key={d.study_date} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-gray-600">{d.study_date.slice(5)}</span>
              <span className="h-3 rounded bg-amber-400" style={{ width: `${Math.min(100, (d.sec / 1800) * 100)}%` }} />
              <span className="shrink-0">
                {Math.round(d.sec / 60)}分
                {d.total ? `・正答率${Math.round(((d.correct ?? 0) / d.total) * 100)}%` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border p-4">
        <h2 className="mb-2 font-bold">よく間違える問題の種類（直近30日）</h2>
        {mistakes.length === 0 && <p className="text-sm text-gray-500">目立つ間違いはありません</p>}
        <ul className="space-y-2 text-sm">
          {mistakes.map((m) => (
            <li key={m.category}>
              <div className="font-bold">
                {m.category}：{m.wrong}/{m.total}問まちがい（{Math.round((m.wrong / m.total) * 100)}%）
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
              {h.from_level && h.from_level !== h.to_level ? `${h.from_level} → ` : ""}
              {h.to_level}（{REASON[h.reason] ?? h.reason}）
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-gray-500">レベルの手動変更は「設定」からできます。</p>
      </section>
    </div>
  );
}
