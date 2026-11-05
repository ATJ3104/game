import Link from "next/link";
import { requireChildPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { getFamilySettings } from "@/server/repo";
import { todayProgress } from "@/server/summary";
import { studyDateOf } from "@/domain/dates";
import { getMathLevel } from "@/domain/math/levels";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";

export const dynamic = "force-dynamic";

export default async function DonePage({ searchParams }: { searchParams: Promise<{ subject?: string; up?: string }> }) {
  const { child } = await requireChildPage();
  const sp = await searchParams;
  const db = await getDB();
  const settings = await getFamilySettings(db, child.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const progress = await todayProgress(db, child, today);
  const dayDone =
    !!(await db.prepare("SELECT 1 FROM daily_completion WHERE child_id = ? AND study_date = ?").bind(child.id, today).first()) ||
    progress.every((p) => p.status === "done");
  const subject = (sp.subject ?? "math") as Subject;
  const up = sp.up ? getMathLevel(sp.up) : undefined;
  const next = progress.find((p) => p.status !== "done");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center">
      <div className="pointer-events-none fixed inset-0" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <span
            key={i}
            className="confetti absolute text-2xl"
            style={{ left: `${(i * 53) % 100}%`, animationDelay: `${(i % 6) * 0.25}s` }}
          >
            {["⭐", "🎉", "✨"][i % 3]}
          </span>
        ))}
      </div>
      <div className="pop text-8xl">{dayDone ? "🏆" : "💮"}</div>
      <h1 className="text-3xl font-bold" data-testid="done-title">
        {dayDone ? "きょうは たっせい！" : `${SUBJECT_LABEL[subject] ?? ""} おわり！`}
      </h1>
      <p className="text-lg text-gray-700">{dayDone ? "まいにち つづけて えらいね！" : "よく がんばったね！"}</p>
      {up && (
        <p className="rounded-2xl bg-amber-100 p-4 text-lg font-bold text-amber-800" data-testid="level-up">
          レベルアップ！ つぎは {up.code}「{up.name}」
        </p>
      )}
      {next && !dayDone ? (
        <Link
          href={`/child/study?subject=${next.subject}`}
          className="flex min-h-16 w-full max-w-xs items-center justify-center rounded-2xl bg-amber-500 text-xl font-bold text-white"
        >
          つぎは {SUBJECT_LABEL[next.subject]}
        </Link>
      ) : null}
      <Link href="/child" className="flex min-h-14 w-full max-w-xs items-center justify-center rounded-2xl border-2 border-amber-500 bg-white text-lg font-bold text-amber-700">
        ホームへ
      </Link>
    </main>
  );
}
