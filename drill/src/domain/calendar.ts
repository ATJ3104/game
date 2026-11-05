// 日ごとの状態・お休み券・月の達成判定・連続日数（SPEC 5章）。すべて純粋関数。
// 状態は記録（達成した日・特別休みの日）から毎回計算する。
import { addDays, addMonths, monthDates, yearMonthOf } from "./dates";

export type DayStatus =
  | "achieved" // 達成（その日の教科をすべて完了）
  | "special" // 特別休み（判定の対象外）
  | "ticket" // お休み券（やらなかった日。その月の1〜5日目）
  | "missed" // 未達成（お休み券が尽きた後のやらなかった日）
  | "today" // 今日（まだ判定前）
  | "future" // 未来
  | "out_of_range"; // 利用開始より前

export interface DayInfo {
  date: string;
  status: DayStatus;
  /** お休み券なら何枚目か */
  ticketNo?: number;
}

export interface MonthInput {
  yearMonth: string;
  /** 今日の学習日（日の区切りを考慮済み） */
  today: string;
  /** 子どもの利用開始日（これより前は判定しない） */
  startDate: string;
  completed: ReadonlySet<string>;
  special: ReadonlySet<string>;
  ticketsPerMonth: number;
}

export type MonthResult =
  | "achieved" // 月が終わって達成
  | "failed" // 未達成の日が出た（月の途中でも確定）
  | "in_progress" // 月の途中で、まだ未達成の日がない
  | "not_applicable"; // 利用開始前の月・未来の月

export interface MonthSummary {
  yearMonth: string;
  days: DayInfo[];
  ticketsUsed: number;
  ticketsLeft: number;
  /** 未達成の日数 */
  missedCount: number;
  /** やらなかった日（お休み券＋未達成） */
  noStudyDays: number;
  achievedDays: number;
  specialDays: number;
  result: MonthResult;
  /** 月が終わっていて結果が確定保存できる */
  finished: boolean;
}

export function computeMonth(input: MonthInput): MonthSummary {
  const { yearMonth, today, startDate, completed, special, ticketsPerMonth } = input;
  const dates = monthDates(yearMonth);
  let used = 0;
  let missed = 0;
  let achieved = 0;
  let specialCount = 0;
  const days: DayInfo[] = dates.map((date) => {
    if (date < startDate) return { date, status: "out_of_range" };
    if (date > today) return { date, status: "future" };
    if (completed.has(date)) {
      achieved++;
      return { date, status: "achieved" };
    }
    if (special.has(date)) {
      specialCount++;
      return { date, status: "special" };
    }
    if (date === today) return { date, status: "today" };
    used++;
    if (used <= ticketsPerMonth) return { date, status: "ticket", ticketNo: used };
    missed++;
    return { date, status: "missed" };
  });
  const lastDate = dates[dates.length - 1]!;
  const finished = today > lastDate;
  const anyInRange = days.some((d) => d.status !== "out_of_range" && d.status !== "future");
  let result: MonthResult;
  if (!anyInRange) result = "not_applicable";
  else if (missed > 0) result = "failed";
  else if (finished) result = "achieved";
  else result = "in_progress";
  const ticketsUsed = Math.min(used, ticketsPerMonth);
  return {
    yearMonth,
    days,
    ticketsUsed,
    ticketsLeft: ticketsPerMonth - ticketsUsed,
    missedCount: missed,
    noStudyDays: used,
    achievedDays: achieved,
    specialDays: specialCount,
    result,
    finished,
  };
}

export interface StreakInput {
  today: string;
  startDate: string;
  completed: ReadonlySet<string>;
  special: ReadonlySet<string>;
  ticketsPerMonth: number;
  /** さかのぼる最大日数（安全のため） */
  maxDays?: number;
}

/**
 * 連続日数。「達成」「特別休み」「お休み券」の日はつながったまま、「未達成」の日で途切れる。
 * 数えるのは、つながっている間の「達成」した日の数。今日まだ終わっていなくても途切れない。
 */
export function computeStreak(input: StreakInput): number {
  const { today, startDate, completed, special, ticketsPerMonth } = input;
  const maxDays = input.maxDays ?? 3 * 366;
  const cache = new Map<string, Map<string, DayInfo>>();
  const statusOf = (date: string): DayStatus => {
    const ym = yearMonthOf(date);
    let m = cache.get(ym);
    if (!m) {
      const s = computeMonth({ yearMonth: ym, today, startDate, completed, special, ticketsPerMonth });
      m = new Map(s.days.map((d) => [d.date, d]));
      cache.set(ym, m);
    }
    return m.get(date)!.status;
  };
  let streak = 0;
  for (let i = 0, d = today; i < maxDays && d >= startDate; i++, d = addDays(d, -1)) {
    const st = statusOf(d);
    if (st === "achieved") streak++;
    else if (st === "missed") break;
    // special / ticket / today はつながったまま
  }
  return streak;
}

/** 月が終わったときに保存する結果（終わっていなければ null） */
export function finalResultOf(s: MonthSummary): {
  achieved: boolean;
  missedDays: number;
  specialDaysCount: number;
} | null {
  if (!s.finished || s.result === "not_applicable") return null;
  return { achieved: s.result === "achieved", missedDays: s.noStudyDays, specialDaysCount: s.specialDays };
}

/** 利用開始の月から、先月までの月の一覧（確定保存の対象） */
export function finishedMonthsSince(startDate: string, today: string): string[] {
  const out: string[] = [];
  const current = yearMonthOf(today);
  for (let ym = yearMonthOf(startDate); ym < current; ym = addMonths(ym, 1)) out.push(ym);
  return out;
}
