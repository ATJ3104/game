import { getDB } from "./db";

/** 失敗回数ベースの簡易レート制限（ログイン・端末登録コードの総当たり対策） */
export async function isRateLimited(key: string, max: number, windowSec: number): Promise<boolean> {
  const db = await getDB();
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first<{
    count: number;
    window_start: string;
  }>();
  if (!row) return false;
  if (Date.now() - Date.parse(row.window_start) > windowSec * 1000) return false;
  return row.count >= max;
}

export async function recordFailure(key: string, windowSec: number): Promise<void> {
  const db = await getDB();
  const now = new Date();
  const row = await db.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?").bind(key).first<{
    count: number;
    window_start: string;
  }>();
  if (!row || now.getTime() - Date.parse(row.window_start) > windowSec * 1000) {
    await db
      .prepare(
        "INSERT INTO rate_limits (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = 1, window_start = excluded.window_start",
      )
      .bind(key, now.toISOString())
      .run();
  } else {
    await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE key = ?").bind(key).run();
  }
}

export async function clearFailures(key: string): Promise<void> {
  const db = await getDB();
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}
