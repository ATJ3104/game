import Link from "next/link";
import { requireChildPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings } from "@/server/repo";
import { loadRecords, streakOf } from "@/server/summary";
import { studyDateOf } from "@/domain/dates";
import { availableLevels, getLevel, levelIndex, IMPLEMENTED_SUBJECTS } from "@/domain/levels";
import { SUBJECT_LABEL, SUBJECTS } from "@/domain/settings";
import { levelOptions } from "@/server/contentPolicy";

export const dynamic = "force-dynamic";

export default async function RecordPage() {
  const { child } = await requireChildPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, child.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const [rec, levels, best] = await Promise.all([
    loadRecords(db, child.id),
    db.prepare("SELECT subject, level_code FROM child_levels WHERE child_id = ?").bind(child.id).all<{ subject: string; level_code: string }>(),
    db
      .prepare("SELECT COUNT(*) AS n FROM level_history WHERE child_id = ? AND reason = 'auto_up'")
      .bind(child.id)
      .first<{ n: number }>(),
  ]);
  const streak = streakOf(child, settings, rec, today);

  return (
    <main className="mx-auto max-w-md space-y-5 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">きろく</h1>
        <Link href="/child" className="min-h-12 rounded-xl bg-white px-4 py-3 font-bold text-amber-700 shadow">
          ホーム
        </Link>
      </header>
      <section className="grid grid-cols-3 gap-3 text-center">
        <div className="rounded-3xl bg-white p-3 shadow">
          <div className="text-xs font-bold text-gray-500">たっせいした ひ</div>
          <div className="text-3xl font-bold" data-testid="achieved-total">{rec.completed.size}</div>
        </div>
        <div className="rounded-3xl bg-white p-3 shadow">
          <div className="text-xs font-bold text-gray-500">れんぞく</div>
          <div className="text-3xl font-bold">{streak}</div>
        </div>
        <div className="rounded-3xl bg-white p-3 shadow">
          <div className="text-xs font-bold text-gray-500">レベルアップ</div>
          <div className="text-3xl font-bold">{best?.n ?? 0}</div>
        </div>
      </section>
      <section className="space-y-3 rounded-3xl bg-white p-4 shadow">
        <h2 className="font-bold text-gray-600">いまの レベル</h2>
        {SUBJECTS.map((s) => {
          const code = levels.results.find((l) => l.subject === s)?.level_code;
          if (!IMPLEMENTED_SUBJECTS.includes(s) || !code) {
            return (
              <div key={s} className="rounded-2xl border-2 p-3 opacity-40">
                {SUBJECT_LABEL[s]}：じゅんびちゅう
              </div>
            );
          }
          const lv = getLevel(s, code);
          const total = availableLevels(s, levelOptions()).length;
          const idx = levelIndex(s, code, levelOptions()) + 1;
          const pct = total ? Math.round((idx / total) * 100) : 0;
          return (
            <div key={s} className="rounded-2xl border-2 p-3">
              <div className="font-bold">
                {SUBJECT_LABEL[s]}：{code}
              </div>
              <div className="text-sm text-gray-600">{lv?.name}</div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 text-right text-xs text-gray-500">
                {idx} / {total}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
