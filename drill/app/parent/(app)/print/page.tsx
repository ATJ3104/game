import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { listChildren } from "@/server/repo";
import { levelOptions } from "@/server/contentPolicy";
import { availableLevels } from "@/domain/levels";
import { getJapaneseLevel } from "@/domain/japanese/levels";
import { PRINT_COUNTS } from "@/domain/print";
import { btnPrimary, inputCls, labelCls } from "@/ui/ActionForm";

export const dynamic = "force-dynamic";

function Select({ label, name, children, defaultValue }: { label: string; name: string; children: React.ReactNode; defaultValue?: string | number }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <select name={name} className={inputCls} defaultValue={defaultValue}>
        {children}
      </select>
    </label>
  );
}

export default async function PrintPage() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const children = await listChildren(db, parent.family_id);
  const opts = levelOptions();
  const mathLevels = availableLevels("math", opts);
  const kanjiLevels = availableLevels("japanese", opts).filter((l) => getJapaneseLevel(l.code)?.kind === "kanji");

  if (children.length === 0) {
    return <p className="text-gray-500">先に「設定」で子どもを登録してください。</p>;
  }

  const childSelect = (
    <Select label="子ども" name="child">
      {children.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}（小{c.grade}）
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">プリント</h1>
      <p className="text-sm text-gray-600">
        紙に書いて練習するプリントを作ります。A4 で印刷するか、印刷の画面で「PDF に保存」を選んでください。問題のページのあとに、答えのページが続きます。プリントは毎日の「達成」には数えません。
      </p>

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">算数の計算プリント</h2>
        <form action="/parent/print-sheet" method="get" target="_blank" className="space-y-4">
          <input type="hidden" name="type" value="math" />
          {childSelect}
          <Select label="レベル" name="level" defaultValue="current">
            <option value="current">いまのレベル</option>
            {mathLevels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.code} {l.name}
              </option>
            ))}
          </Select>
          <Select label="問題数" name="count" defaultValue={20}>
            {PRINT_COUNTS.math.map((n) => (
              <option key={n} value={n}>
                {n}問
              </option>
            ))}
          </Select>
          <button className={btnPrimary}>プリントを作る</button>
        </form>
      </section>

      <section className="space-y-4 rounded-2xl border p-4">
        <h2 className="text-lg font-bold">漢字の書き取りプリント</h2>
        <p className="text-sm text-gray-600">例文の □ に漢字を書きます（□の上に読みがなが付きます）。</p>
        {kanjiLevels.length === 0 ? (
          <p className="text-sm text-gray-500">使える漢字の教材がまだありません。</p>
        ) : (
          <form action="/parent/print-sheet" method="get" target="_blank" className="space-y-4">
            <input type="hidden" name="type" value="kanji" />
            {childSelect}
            <Select label="レベル" name="level" defaultValue="current">
              <option value="current">いまのレベル（ひらがな・カタカナの子は1年の漢字から）</option>
              {kanjiLevels.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.code} {l.name}
                </option>
              ))}
            </Select>
            <Select label="問題数" name="count" defaultValue={10}>
              {PRINT_COUNTS.kanji.map((n) => (
                <option key={n} value={n}>
                  {n}問
                </option>
              ))}
            </Select>
            <button className={btnPrimary}>プリントを作る</button>
          </form>
        )}
      </section>
    </div>
  );
}
