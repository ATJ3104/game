import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings, listChildren } from "@/server/repo";
import { finalizeMonths, loadRecords, monthLabel, monthSummary } from "@/server/summary";
import { studyDateOf, yearMonthOf } from "@/domain/dates";
import { ActionForm, btnSmall } from "@/ui/ActionForm";
import { togglePaidAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ResultsPage() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const children = await listChildren(db, parent.family_id);

  const blocks = await Promise.all(
    children.map(async (c) => {
      const rec = await loadRecords(db, c.id);
      await finalizeMonths(db, c, settings, rec, today);
      const current = monthSummary(c, settings, rec, yearMonthOf(today), today);
      const rows = await db
        .prepare(
          "SELECT year_month, achieved, missed_days, special_days_count, paid_at FROM monthly_results WHERE child_id = ? ORDER BY year_month DESC LIMIT 24",
        )
        .bind(c.id)
        .all<{ year_month: string; achieved: number; missed_days: number; special_days_count: number; paid_at: string | null }>();
      return { child: c, current, rows: rows.results };
    }),
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">月の結果</h1>
      <p className="text-sm text-gray-600">
        やらなかった日が月{settings.ticketsPerMonth}日以内（特別休みを除く）なら達成です。月が終わると結果が確定します。
      </p>
      {blocks.map(({ child, current, rows }) => (
        <section key={child.id} className="space-y-3 rounded-2xl border p-4">
          <h2 className="text-lg font-bold">
            {child.name}
            <span className="ml-2 text-sm font-normal text-gray-500">お小遣い {child.allowance_amount.toLocaleString()}円</span>
          </h2>
          <div className="rounded-xl bg-gray-50 p-3 text-sm">
            <span className="font-bold">{monthLabel(current.yearMonth)}（今月）：</span>
            {current.result === "failed"
              ? "達成ならず（確定）"
              : `継続中・残りお休み券 ${current.ticketsLeft}枚`}
          </div>
          {rows.length === 0 && <p className="text-sm text-gray-500">確定した月はまだありません</p>}
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.year_month} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-sm" data-testid={`result-${r.year_month}`}>
                <div>
                  <div className="font-bold">
                    {monthLabel(r.year_month)}：{r.achieved ? "🎉 達成" : "達成ならず"}
                  </div>
                  <div className="text-gray-600">
                    やらなかった日 {r.missed_days}日・特別休み {r.special_days_count}日
                    {r.paid_at ? `・支払い済み（${new Date(r.paid_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}）` : ""}
                  </div>
                </div>
                {r.achieved === 1 && (
                  <ActionForm action={togglePaidAction} submitLabel={r.paid_at ? "✅ 支払い済み" : "支払い済みにする"} className="shrink-0" submitClassName={btnSmall}>
                    <input type="hidden" name="child_id" value={child.id} />
                    <input type="hidden" name="year_month" value={r.year_month} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
