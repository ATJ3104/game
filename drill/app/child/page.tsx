import Link from "next/link";
import { requireChildPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings } from "@/server/repo";
import { ensureDailyCompletion, finalizeMonths, loadRecords, monthLabel, monthSummary, streakOf, todayProgress } from "@/server/summary";
import { studyDateOf, yearMonthOf } from "@/domain/dates";
import { SUBJECT_LABEL, SUBJECTS } from "@/domain/settings";
import { MonthCalendar } from "@/ui/MonthCalendar";
import { SoundTest } from "@/ui/SoundTest";

export const dynamic = "force-dynamic";

export default async function ChildHome() {
  const { child } = await requireChildPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, child.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const progress = await todayProgress(db, child, today);
  await ensureDailyCompletion(db, child, today, progress);
  const rec = await loadRecords(db, child.id);
  await finalizeMonths(db, child, settings, rec, today);
  const month = monthSummary(child, settings, rec, yearMonthOf(today), today);
  const streak = streakOf(child, settings, rec, today);
  const doneToday = rec.completed.has(today);
  const next = progress.find((p) => p.status !== "done");

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{child.name}さん</h1>
        <Link href="/child/record" className="min-h-12 rounded-xl bg-white px-4 py-3 font-bold text-amber-700 shadow">
          きろく
        </Link>
      </header>

      <section className="space-y-3 rounded-3xl bg-white p-4 shadow">
        <h2 className="flex items-center justify-between font-bold text-gray-600">
          <span>きょうの メニュー</span>
          <span className="text-sm">
            あわせて {progress.reduce((t, p) => t + p.targetQuestions, 0)}もん（やく {Math.round(progress.reduce((t, p) => t + p.targetSeconds, 0) / 60)}ぷん）
          </span>
        </h2>
        <ul className="space-y-2">
          {SUBJECTS.map((s) => {
            const p = progress.find((x) => x.subject === s);
            const enabled = !!p;
            const pct = p ? Math.min(100, Math.round((p.answered / Math.max(1, p.targetQuestions)) * 100)) : 0;
            return (
              <li key={s} className={`rounded-2xl border-2 p-3 ${enabled ? "" : "opacity-40"}`} data-testid={`menu-${s}`}>
                <div className="flex items-center justify-between font-bold">
                  <span>{SUBJECT_LABEL[s]}</span>
                  <span className="text-sm">
                    {!enabled
                      ? "じゅんびちゅう"
                      : p?.status === "done"
                        ? "✅ おわり"
                        : p?.status === "not_started"
                          ? `${p.targetQuestions}もん`
                          : p?.status === "retry"
                            ? "まちがいなおし"
                            : `${p?.answered}/${p?.targetQuestions}もん`}
                  </span>
                </div>
                {enabled && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-amber-400" style={{ width: `${p?.status === "done" ? 100 : pct}%` }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {doneToday ? (
          <p className="rounded-2xl bg-amber-100 p-4 text-center text-lg font-bold text-amber-800">きょうは たっせい！ 🎉</p>
        ) : next ? (
          <Link
            href={`/child/study?subject=${next.subject}`}
            className="flex min-h-16 items-center justify-center rounded-2xl bg-amber-500 text-2xl font-bold text-white shadow active:scale-[0.98]"
          >
            {next.status === "not_started" ? "はじめる" : "つづきから"}
          </Link>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-white p-4 text-center shadow">
          <div className="text-sm font-bold text-gray-500">れんぞく</div>
          <div className="text-3xl font-bold" data-testid="streak">
            {streak}<span className="text-base">にち</span>
          </div>
        </div>
        <div className="rounded-3xl bg-white p-4 text-center shadow">
          <div className="text-sm font-bold text-gray-500">のこりの おやすみけん</div>
          <div className="text-3xl font-bold" data-testid="tickets-left">
            {"🎫".repeat(month.ticketsLeft) || "0"}
          </div>
        </div>
      </section>

      <section className="rounded-3xl bg-white p-4 shadow">
        <h2 className="mb-2 font-bold text-gray-600">{monthLabel(month.yearMonth)}</h2>
        {month.result === "failed" && (
          <p className="mb-2 rounded-xl bg-gray-100 p-2 text-center text-sm">こんげつは おやすみけんを つかいきったよ。らいげつ がんばろう！</p>
        )}
        <MonthCalendar days={month.days} />
      </section>

      <div className="text-center">
        <SoundTest />
      </div>
    </main>
  );
}
