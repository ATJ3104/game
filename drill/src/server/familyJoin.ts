// 家族アカウントをまとめる：別の家族アカウントのおうちの人を、招待コードで同じ家族に入れる
import { randomDigits, sha256Hex } from "./crypto";

/** 1つの家族アカウントに入れるおうちの人の数（父母のほか、祖父母や確認用も想定） */
export const MAX_PARENTS = 4;

export async function createFamilyInvite(db: D1Database, familyId: string, parentId: string): Promise<{ code: string; expiresAt: string }> {
  const now = Date.now();
  await db
    .prepare("DELETE FROM family_invites WHERE family_id = ? OR expires_at < ?")
    .bind(familyId, new Date(now - 86400_000).toISOString())
    .run();
  for (let i = 0; i < 5; i++) {
    const code = randomDigits(8);
    const expiresAt = new Date(now + 30 * 60 * 1000).toISOString();
    try {
      await db
        .prepare("INSERT INTO family_invites (code_hash, family_id, created_by_parent_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(await sha256Hex(`family:${code}`), familyId, parentId, expiresAt, new Date(now).toISOString())
        .run();
      return { code, expiresAt };
    } catch {
      // まれに重複したら作り直す
    }
  }
  throw new Error("招待コードを発行できませんでした");
}

export type JoinResult =
  | { ok: true; removedChildren: number; keptOldFamily: boolean }
  | { ok: false; reason: "invalid" | "same_family" | "full" };

/**
 * 招待コードの家族に移る。もとの家族アカウントに他のおうちの人がいなくなったら、
 * 学習の記録がない子どもの登録を消す（記録のある子どもは消さずに残す）
 */
export async function joinFamily(db: D1Database, parent: { id: string; family_id: string }, code: string): Promise<JoinResult> {
  const now = new Date().toISOString();
  const hash = await sha256Hex(`family:${code}`);
  const invite = await db
    .prepare("SELECT family_id FROM family_invites WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?")
    .bind(hash, now)
    .first<{ family_id: string }>();
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.family_id === parent.family_id) return { ok: false, reason: "same_family" };
  const count = await db.prepare("SELECT COUNT(*) AS n FROM parents WHERE family_id = ?").bind(invite.family_id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PARENTS) return { ok: false, reason: "full" };
  // コードを使用済みにできたときだけ進む（同時に2回使われるのを防ぐ）
  const claimed = await db
    .prepare("UPDATE family_invites SET used_at = ? WHERE code_hash = ? AND used_at IS NULL")
    .bind(now, hash)
    .run();
  if (!claimed.meta.changes) return { ok: false, reason: "invalid" };

  const oldFamily = parent.family_id;
  await db.prepare("UPDATE parents SET family_id = ? WHERE id = ?").bind(invite.family_id, parent.id).run();

  // もとの家族アカウントの後始末
  const left = await db.prepare("SELECT COUNT(*) AS n FROM parents WHERE family_id = ?").bind(oldFamily).first<{ n: number }>();
  if ((left?.n ?? 0) > 0) return { ok: true, removedChildren: 0, keptOldFamily: true };
  const kids = await db
    .prepare(
      "SELECT c.id, (SELECT COUNT(*) FROM sessions s WHERE s.child_id = c.id) AS n FROM children c WHERE c.family_id = ?",
    )
    .bind(oldFamily)
    .all<{ id: string; n: number }>();
  const empty = kids.results.filter((k) => k.n === 0);
  const stmts: D1PreparedStatement[] = [];
  for (const k of empty) {
    for (const t of ["pairing_codes", "devices", "child_levels", "level_history", "special_days", "monthly_results", "daily_completion"]) {
      stmts.push(db.prepare(`DELETE FROM ${t} WHERE child_id = ?`).bind(k.id));
    }
    stmts.push(db.prepare("DELETE FROM children WHERE id = ?").bind(k.id));
  }
  const keep = empty.length < kids.results.length;
  if (!keep) {
    // 記録のある子どもがいなければ、家族アカウントごと消す
    for (const t of ["notification_log", "family_invites", "family_settings"]) {
      stmts.push(db.prepare(`DELETE FROM ${t} WHERE family_id = ?`).bind(oldFamily));
    }
    stmts.push(db.prepare("DELETE FROM families WHERE id = ?").bind(oldFamily));
  }
  if (stmts.length) await db.batch(stmts);
  return { ok: true, removedChildren: empty.length, keptOldFamily: keep };
}
