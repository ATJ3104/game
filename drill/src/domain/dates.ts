// 日付の純粋関数。日本は夏時間がないので「UTC+9時間」で固定して扱う。
// 日付は 'YYYY-MM-DD'、月は 'YYYY-MM' の文字列で表す。

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

/** UTC の Date から 'YYYY-MM-DD'（UTC 基準のフィールドで） */
function utcDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && utcDateString(d) === s;
}

/**
 * ある時刻が「どの学習日」に属するか。
 * 日本時間で boundaryHour 時より前は前日扱い（初期値 3:00、2:59 は前日）。
 */
export function studyDateOf(instant: Date, boundaryHour = 3): string {
  const shifted = new Date(instant.getTime() + JST_OFFSET_MS - boundaryHour * 60 * 60 * 1000);
  return utcDateString(shifted);
}

/** 学習日 date が始まる時刻（UTC の Date） */
export function studyDayStart(date: string, boundaryHour = 3): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - JST_OFFSET_MS + boundaryHour * 60 * 60 * 1000);
}

export function addDays(date: string, n: number): string {
  return utcDateString(new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS));
}

/** a から b までの日数（b - a） */
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function yearMonthOf(date: string): string {
  return date.slice(0, 7);
}

export function daysInMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthDates(yearMonth: string): string[] {
  const n = daysInMonth(yearMonth);
  return Array.from({ length: n }, (_, i) => `${yearMonth}-${pad(i + 1)}`);
}

export function addMonths(yearMonth: string, n: number): string {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 0=日曜 … 6=土曜 */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** from〜to（両端含む）の日付一覧。from > to なら空 */
export function dateRange(from: string, to: string): string[] {
  const n = diffDays(from, to);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(from, i));
}
