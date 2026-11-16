import Link from "next/link";
import { requireParentPage } from "@/server/auth";
import { getDB } from "@/server/db";
import { childSubjects, getFamilySettings, listChildren, minutesFor } from "@/server/repo";
import { questionQuota } from "@/domain/session";
import { finalizeMonths, loadRecords, monthSummary, streakOf } from "@/server/summary";
import { addDays, studyDateOf, weekdayOf, yearMonthOf } from "@/domain/dates";
import type { DayStatus } from "@/domain/calendar";
import { getLevel } from "@/domain/levels";
import { jstTime } from "@/domain/notify";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";
import { AutoRefresh } from "@/ui/AutoRefresh";

export const dynamic = "force-dynamic";

type SubjectStatus = "not_started" | "studying" | "retry" | "done";

const DAY_STATE = {
  not_started: { text: "未着手", cls: "bg-gray-100 text-gray-700" },
  in_progress: { text: "途中", cls: "bg-sky-100 text-sky-800" },
  achieved: { text: "完了", cls: "bg-amber-400 text-white" },
  special: { text: "特別休み", cls: "bg-violet-100 text-violet-800" },
} as const;

const SUBJECT_STATE: Record<SubjectStatus, { text: string; cls: string }> = {
  not_started: { text: "まだ", cls: "text-gray-400" },
  studying: { text: "学習中", cls: "text-sky-700" },
  retry: { text: "まちがい直し中", cls: "text-rose-600" },
  done: { text: "✅ 完了", cls: "text-green-700" },
};

const WEEK_DOT: Record<DayStatus, { cls: string; label: string }> = {
  achieved: { cls: "bg-amber-400", label: "達成" },
  special: { cls: "bg-violet-300", label: "特別休み" },
  ticket: { cls: "bg-sky-300", label: "お休み券" },
  missed: { cls: "bg-gray-500", label: "未達成" },
  today: { cls: "bg-white ring-2 ring-amber-400", label: "今日" },
  future: { cls: "bg-gray-100", label: "" },
  out_of_range: { cls: "bg-gray-100", label: "利用前" },
};

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const RESULT_LABEL = { achieved: "達成", failed: "達成ならず", in_progress: "継続中", not_applicable: "—" } as const;

export default async function ParentDashboard() {
  const { parent } = await requireParentPage();
  const db = await getDB();
  const settings = await getFamilySettings(db, parent.family_id);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const children = await listChildren(db, parent.family_id);
  const familyParents = await db
    .prepare("SELECT name FROM parents WHERE family_id = ? ORDER BY created_at")
    .bind(parent.family_id)
    .all<{ name: string }>();
  const deviceCount =
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM devices d JOIN children c ON c.id = d.child_id WHERE c.family_id = ? AND d.revoked_at IS NULL")
        .bind(parent.family_id)
        .first<{ n: number }>()
    )?.n ?? 0;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  const cards = await Promise.all(
    children.map(async (c) => {
      const [rec, subjects, sessions, levels, last, perSubject] = await Promise.all([
        loadRecords(db, c.id),
        childSubjects(db, c.id),
        db
          .prepare(
            "SELECT subject, status, active_seconds, target_seconds, target_questions, answered, eval_total, eval_correct, id FROM sessions WHERE child_id = ? AND study_date = ?",
          )
          .bind(c.id, today)
          .all<{
            id: string;
            subject: Subject;
            status: SubjectStatus;
            active_seconds: number;
            target_seconds: number;
            target_questions: number | null;
            answered: number;
            eval_total: number | null;
            eval_correct: number | null;
          }>(),
        db
          .prepare("SELECT subject, level_code FROM child_levels WHERE child_id = ?")
          .bind(c.id)
          .all<{ subject: Subject; level_code: string }>(),
        db
          .prepare(
            `SELECT MAX(a.created_at) AS t, COUNT(*) AS n, SUM(CASE WHEN a.is_retry = 0 AND a.is_correct = 1 THEN 1 ELSE 0 END) AS ok,
                    SUM(CASE WHEN a.is_retry = 0 THEN 1 ELSE 0 END) AS first
               FROM attempts a JOIN sessions s ON s.id = a.session_id WHERE s.child_id = ? AND s.study_date = ?`,
          )
          .bind(c.id, today)
          .first<{ t: string | null; n: number; ok: number | null; first: number | null }>(),
        db
          .prepare(
            `SELECT s.subject, SUM(CASE WHEN a.is_retry = 0 THEN 1 ELSE 0 END) AS n,
                    SUM(CASE WHEN a.is_retry = 0 AND a.is_correct = 1 THEN 1 ELSE 0 END) AS ok
               FROM attempts a JOIN sessions s ON s.id = a.session_id
              WHERE s.child_id = ? AND s.study_date = ? GROUP BY s.subject`,
          )
          .bind(c.id, today)
          .all<{ subject: Subject; n: number; ok: number }>(),
      ]);
      await finalizeMonths(db, c, settings, rec, today);
      const month = monthSummary(c, settings, rec, yearMonthOf(today), today);
      // 直近7日の状態（月をまたぐときは前の月も計算）
      const statusOf = new Map<string, DayStatus>();
      for (const ym of new Set(week.map(yearMonthOf))) {
        for (const d of monthSummary(c, settings, rec, ym, today).days) statusOf.set(d.date, d.status);
      }
      const bySubject = new Map(sessions.results.map((s) => [s.subject, s]));
      const rows = subjects.map((subject) => {
        const s = bySubject.get(subject);
        const lv = levels.results.find((l) => l.subject === subject)?.level_code ?? "";
        const quota = s
          ? (s.target_questions ?? questionQuota(s.target_seconds, getLevel(subject, lv)?.targetMs ?? 5000))
          : questionQuota(minutesFor(c, subject) * 60, getLevel(subject, lv)?.targetMs ?? 5000);
        return {
          subject,
          status: (s?.status ?? "not_started") as SubjectStatus,
          minutes: Math.floor((s?.active_seconds ?? 0) / 60),
          answered: s?.answered ?? 0,
          quota,
          solved: perSubject.results.find((x) => x.subject === subject)?.n ?? 0,
          correct: perSubject.results.find((x) => x.subject === subject)?.ok ?? 0,
          pct: s ? Math.min(100, Math.round((s.answered / Math.max(1, quota)) * 100)) : 0,
          level: lv,
          levelName: getLevel(subject, lv)?.name ?? "",
        };
      });
      const completedAt = rec.completed.has(today)
        ? (
            await db
              .prepare("SELECT completed_at FROM daily_completion WHERE child_id = ? AND study_date = ?")
              .bind(c.id, today)
              .first<{ completed_at: string }>()
          )?.completed_at
        : undefined;
      const state = completedAt
        ? "achieved"
        : rec.special.has(today)
          ? "special"
          : sessions.results.length
            ? "in_progress"
            : "not_started";
      return {
        child: c,
        state,
        completedAt,
        rows,
        month,
        streak: streakOf(c, settings, rec, today),
        lastAt: last?.t ?? null,
        answered: last?.n ?? 0,
        accuracy: last?.first ? Math.round(((last.ok ?? 0) / last.first) * 100) : null,
        week: week.map((d) => ({ date: d, status: statusOf.get(d) ?? "out_of_range" })),
      };
    }),
  );

  const doneCount = cards.filter((c) => c.state === "achieved").length;
  const target = cards.filter((c) => c.state !== "special" && c.rows.length > 0).length;

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <section className="rounded-2xl bg-amber-50 p-4" data-testid="today-summary">
        <div className="text-sm text-gray-600">
          今日（{Number(today.slice(5, 7))}月{Number(today.slice(8))}日・{WEEK[weekdayOf(today)]}）
        </div>
        <div className="mt-1 text-2xl font-bold">
          {target === 0 ? "今日の予定はありません" : doneCount === target ? "🎉 全員 完了しました" : `完了 ${doneCount} / ${target} 人`}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {cards.map((c) => (
            <span key={c.child.id} className={`rounded-full px-3 py-1 text-sm font-bold ${DAY_STATE[c.state as keyof typeof DAY_STATE].cls}`}>
              {c.child.name}：{DAY_STATE[c.state as keyof typeof DAY_STATE].text}
              {c.completedAt ? `（${jstTime(c.completedAt)}）` : ""}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500" data-testid="family-info">
          この家族アカウントのおうちの人：{familyParents.results.map((p) => p.name).join("・")}（ログイン中：{parent.name}）。1分ごとに自動で更新します。
        </p>
      </section>

      {cards.length > 0 && deviceCount === 0 && (
        <p className="rounded-2xl border-2 border-amber-300 bg-white p-4 text-sm" data-testid="no-device-hint">
          この家族アカウントには、子どもの端末が1台も登録されていません。進み具合が出ないときは、子どもの端末が<strong>別の家族アカウント</strong>に登録されている可能性があります。
          <Link href="/parent/settings" className="font-bold text-amber-700 underline">
            「設定」→「家族アカウントをまとめる」
          </Link>
          で1つにまとめられます。
        </p>
      )}

      {cards.length === 0 && (
        <p className="rounded-2xl bg-amber-50 p-4">
          まだ子どもが登録されていません。<Link href="/parent/settings" className="font-bold underline">設定</Link>から登録してください。
        </p>
      )}

      {cards.map((c) => {
        const st = DAY_STATE[c.state as keyof typeof DAY_STATE];
        return (
          <Link
            key={c.child.id}
            href={`/parent/children/${c.child.id}`}
            className="block space-y-3 rounded-2xl border p-4 active:bg-gray-50"
            data-testid={`child-card-${c.child.name}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-bold">
                {c.child.name}
                <span className="ml-2 text-sm font-normal text-gray-500">小{c.child.grade}</span>
              </span>
              <span className={`rounded-full px-3 py-1 text-sm font-bold ${st.cls}`} data-testid="day-state">
                {st.text}
                {c.completedAt ? ` ${jstTime(c.completedAt)}` : ""}
              </span>
            </div>

            <ul className="space-y-2">
              {c.rows.map((r) => (
                <li key={r.subject} className="text-sm" data-testid={`subject-${r.subject}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {SUBJECT_LABEL[r.subject]}
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        {r.level} {r.levelName}
                      </span>
                    </span>
                    <span className={`shrink-0 font-bold ${SUBJECT_STATE[r.status].cls}`}>
                      {SUBJECT_STATE[r.status].text}
                      {` ${r.answered}/${r.quota}問`}
                    </span>
                  </div>
                  {r.solved > 0 && (
                    <div className="text-xs text-gray-600" data-testid={`solved-${r.subject}`}>
                      正解 {r.correct}問・まちがい {r.solved - r.correct}問（正答率 {Math.round((r.correct / r.solved) * 100)}%）
                    </div>
                  )}
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full ${r.status === "done" ? "bg-green-500" : "bg-amber-400"}`}
                      style={{ width: `${r.status === "done" ? 100 : r.pct}%` }}
                    />
                  </div>
                </li>
              ))}
              {c.rows.length === 0 && <li className="text-sm text-gray-500">学習する教科が設定されていません</li>}
            </ul>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
              <span>最後の学習 {c.lastAt ? jstTime(c.lastAt) : "—"}</span>
              <span className="font-bold text-amber-700">くわしく見る ›</span>
            </div>

            <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500">
                {c.week.map((d) => (
                  <div key={d.date}>{WEEK[weekdayOf(d.date)]}</div>
                ))}
              </div>
              <div className="mt-0.5 grid grid-cols-7 gap-1" aria-label="直近7日">
                {c.week.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date} ${WEEK_DOT[d.status].label}`}
                    className={`mx-auto h-4 w-4 rounded-full ${WEEK_DOT[d.status].cls}`}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-t pt-2 text-center text-xs text-gray-600">
              <div>
                <div className="text-base font-bold text-gray-900">{c.month.achievedDays}日</div>
                今月の達成
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">{c.month.ticketsLeft}枚</div>
                お休み券
              </div>
              <div>
                <div className="text-base font-bold text-gray-900">{c.streak}日</div>
                連続
              </div>
            </div>
            <div className="text-right text-xs text-gray-500">今月：{RESULT_LABEL[c.month.result]}</div>
          </Link>
        );
      })}
    </div>
  );
}
