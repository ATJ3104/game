import Link from "next/link";
import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings, listChildren } from "@/server/repo";
import { dayState, finalizeMonths, loadRecords, monthSummary, streakOf, todayProgress } from "@/server/summary";
import { studyDateOf, yearMonthOf } from "@/domain/dates";
import { getLevel } from "@/domain/levels";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";

export const dynamic = "force-dynamic";

const STATE_LABEL = {
  not_started: { text: "未着手", cls: "bg-gray-100 text-gray-700" },
  in_progress: { text: "途中", cls: "bg-sky-100 text-sky-800" },
  achieved: { text: "達成", cls: "bg-amber-100 text-amber-800" },
} as const;

const RESULT_LABEL = {
  achieved: "達成",
  failed: "達成ならず",
  in_progress: "継続中",
  not_applicable: "—",
} as const;

export default async function ParentDashboard() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const children = await listChildren(db, parent.family_id);

  const cards = await Promise.all(
    children.map(async (c) => {
      const [rec, progress, level] = await Promise.all([
        loadRecords(db, c.id),
        todayProgress(db, c, today),
        db
          .prepare("SELECT subject, level_code FROM child_levels WHERE child_id = ?")
          .bind(c.id)
          .all<{ subject: Subject; level_code: string }>(),
      ]);
      await finalizeMonths(db, c, settings, rec, today);
      const month = monthSummary(c, settings, rec, yearMonthOf(today), today);
      return {
        child: c,
        state: dayState(progress, rec.completed.has(today)),
        progress,
        month,
        streak: streakOf(c, settings, rec, today),
        levels: level.results,
      };
    }),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">きょうの様子（{today}）</h1>
      {cards.length === 0 && (
        <p className="rounded-2xl bg-amber-50 p-4">
          まだ子どもが登録されていません。<Link href="/parent/settings" className="font-bold underline">設定</Link>から登録してください。
        </p>
      )}
      {cards.map(({ child, state, progress, month, streak, levels }) => {
        const st = STATE_LABEL[state];
        return (
          <Link
            key={child.id}
            href={`/parent/children/${child.id}`}
            className="block rounded-2xl border p-4 active:bg-gray-50"
            data-testid={`child-card-${child.name}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">
                {child.name}
                <span className="ml-2 text-sm font-normal text-gray-500">小{child.grade}</span>
              </span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.cls}`} data-testid="day-state">
                {st.text}
              </span>
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {progress.map((p) => {
                const lv = levels.find((l) => l.subject === p.subject)?.level_code ?? "";
                return (
                  <li key={p.subject} className="flex items-center justify-between">
                    <span>
                      {SUBJECT_LABEL[p.subject]}・{lv}
                      <span className="ml-1 text-xs text-gray-500">{getLevel(p.subject, lv)?.name}</span>
                    </span>
                    <span className="font-bold">
                      {p.status === "done" ? "✅ " : ""}
                      {Math.floor(p.activeSeconds / 60)}/{Math.round(p.targetSeconds / 60)}分
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs text-gray-600">
              <div>
                <div className="text-base font-bold text-gray-900">{month.ticketsLeft}枚</div>
                お休み券
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">{streak}日</div>
                連続
              </div>
            </div>
            <div className="mt-2 text-right text-xs text-gray-500">今月：{RESULT_LABEL[month.result]}</div>
          </Link>
        );
      })}
    </div>
  );
}
