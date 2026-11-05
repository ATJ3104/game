import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings, listChildren } from "@/server/repo";
import { ActionForm, btnDanger, Field, inputCls, labelCls } from "@/ui/ActionForm";
import { addDays, studyDateOf } from "@/domain/dates";
import { addSpecialDaysAction, deleteSpecialDayAction } from "./actions";
import { SPECIAL_REASONS as REASONS } from "@/domain/specialDays";

export const dynamic = "force-dynamic";

export default async function SpecialDaysPage() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const children = await listChildren(db, parent.family_id);
  const rows = await db
    .prepare(
      `SELECT s.id, s.date, s.reason, s.memo, c.name, p.name AS parent_name FROM special_days s
         JOIN children c ON c.id = s.child_id
         LEFT JOIN parents p ON p.id = s.created_by_parent_id
        WHERE c.family_id = ? AND s.date >= ?
        ORDER BY s.date DESC, c.name LIMIT 200`,
    )
    .bind(parent.family_id, addDays(today, -92))
    .all<{ id: string; date: string; reason: string; memo: string | null; name: string; parent_name: string | null }>();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">特別休み</h1>
      <p className="text-sm text-gray-600">
        特別休みの日は「やらなくてよい日」です。お休み券は減らず、月の判定からも外れます。過去の日にさかのぼって登録・取り消しもできます。
      </p>
      {children.length === 0 ? (
        <p className="text-gray-500">先に「設定」で子どもを登録してください。</p>
      ) : (
        <section className="rounded-2xl border p-4">
          <ActionForm action={addSpecialDaysAction} submitLabel="登録する">
            <fieldset>
              <legend className={labelCls}>子ども</legend>
              <div className="flex flex-wrap gap-2">
                {children.map((c) => (
                  <label key={c.id} className="flex min-h-12 items-center gap-2 rounded-xl border px-3">
                    <input type="checkbox" name="child_id" value={c.id} defaultChecked={children.length === 1} className="h-5 w-5" />
                    {c.name}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <Field label="始めの日" name="from" type="date" defaultValue={today} required />
              <Field label="終わりの日（1日なら空欄）" name="to" type="date" />
            </div>
            <label className="block">
              <span className={labelCls}>理由</span>
              <select name="reason" className={inputCls} defaultValue="sick">
                {Object.entries(REASONS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <Field label="メモ（「その他」のときは必須）" name="memo" maxLength={200} />
          </ActionForm>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-bold">登録済み（直近3か月〜未来）</h2>
        {rows.results.length === 0 && <p className="text-sm text-gray-500">まだありません</p>}
        <ul className="space-y-2">
          {rows.results.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3 text-sm">
              <div>
                <div className="font-bold">
                  {r.date}　{r.name}
                </div>
                <div className="text-gray-600">
                  {REASONS[r.reason] ?? r.reason}
                  {r.memo ? `：${r.memo}` : ""}
                  {r.parent_name ? `（${r.parent_name}）` : ""}
                </div>
              </div>
              <ActionForm action={deleteSpecialDayAction} submitLabel="取り消し" className="shrink-0" submitClassName={btnDanger}>
                <input type="hidden" name="id" value={r.id} />
              </ActionForm>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
