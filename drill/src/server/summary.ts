// 子どもの状態の集計（カレンダー・連続日数・今日の進み具合・月の結果の確定保存）
import type { ChildRow } from "./auth";
import { minutesFor } from "./repo";
import { computeMonth, computeStreak, finalResultOf, finishedMonthsSince, type MonthSummary } from "@/domain/calendar";
import { ENABLED_SUBJECTS, type FamilySettings, type Subject } from "@/domain/settings";

export interface ChildRecords {
  completed: Set<string>;
  special: Set<string>;
}

/** 達成した日・特別休みの日（全期間。家庭用なので件数は少ない） */
export async function loadRecords(db: D1Database, childId: string): Promise<ChildRecords> {
  const [c, s] = await db.batch<{ d: string }>([
    db.prepare("SELECT study_date AS d FROM daily_completion WHERE child_id = ?").bind(childId),
    db.prepare("SELECT date AS d FROM special_days WHERE child_id = ?").bind(childId),
  ]);
  return {
    completed: new Set(c!.results.map((r) => r.d)),
    special: new Set(s!.results.map((r) => r.d)),
  };
}

export function monthSummary(
  child: ChildRow,
  settings: FamilySettings,
  rec: ChildRecords,
  yearMonth: string,
  today: string,
): MonthSummary {
  return computeMonth({
    yearMonth,
    today,
    startDate: child.start_date,
    completed: rec.completed,
    special: rec.special,
    ticketsPerMonth: settings.ticketsPerMonth,
  });
}

export function streakOf(child: ChildRow, settings: FamilySettings, rec: ChildRecords, today: string): number {
  return computeStreak({
    today,
    startDate: child.start_date,
    completed: rec.completed,
    special: rec.special,
    ticketsPerMonth: settings.ticketsPerMonth,
  });
}

export type SubjectProgress = {
  subject: Subject;
  status: "not_started" | "studying" | "retry" | "done";
  activeSeconds: number;
  targetSeconds: number;
};

export async function todayProgress(db: D1Database, child: ChildRow, today: string): Promise<SubjectProgress[]> {
  const res = await db
    .prepare("SELECT subject, status, active_seconds, target_seconds FROM sessions WHERE child_id = ? AND study_date = ?")
    .bind(child.id, today)
    .all<{ subject: Subject; status: SubjectProgress["status"]; active_seconds: number; target_seconds: number }>();
  return ENABLED_SUBJECTS.map((subject) => {
    const r = res.results.find((x) => x.subject === subject);
    return r
      ? { subject, status: r.status, activeSeconds: Math.floor(r.active_seconds), targetSeconds: r.target_seconds }
      : { subject, status: "not_started", activeSeconds: 0, targetSeconds: minutesFor(child, subject) * 60 };
  });
}

/** 今日の状態（親ダッシュボード用）：未着手／途中／達成 */
export function dayState(progress: SubjectProgress[], completedToday: boolean): "not_started" | "in_progress" | "achieved" {
  if (completedToday) return "achieved";
  return progress.some((p) => p.status !== "not_started") ? "in_progress" : "not_started";
}

/**
 * 終わった月の結果を保存する（締めのバッチの代わりに、画面を開いたときに実行）。
 * force のときは保存済みでも計算し直して上書きする（特別休みをさかのぼって変えたとき）。支払い済みは残す
 */
export async function finalizeMonths(
  db: D1Database,
  child: ChildRow,
  settings: FamilySettings,
  rec: ChildRecords,
  today: string,
  opts: { force?: boolean; months?: string[] } = {},
): Promise<void> {
  const months = opts.months ?? finishedMonthsSince(child.start_date, today);
  if (months.length === 0) return;
  const existing = await db
    .prepare("SELECT year_month FROM monthly_results WHERE child_id = ?")
    .bind(child.id)
    .all<{ year_month: string }>();
  const have = new Set(existing.results.map((r) => r.year_month));
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  for (const ym of months) {
    if (have.has(ym) && !opts.force) continue;
    const r = finalResultOf(monthSummary(child, settings, rec, ym, today));
    if (!r) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO monthly_results (child_id, year_month, achieved, missed_days, special_days_count, finalized_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(child_id, year_month) DO UPDATE SET
             achieved = excluded.achieved, missed_days = excluded.missed_days,
             special_days_count = excluded.special_days_count, finalized_at = excluded.finalized_at`,
        )
        .bind(child.id, ym, r.achieved ? 1 : 0, r.missedDays, r.specialDaysCount, now),
    );
  }
  if (stmts.length) await db.batch(stmts);
}

export function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${y}年${Number(m)}月`;
}
