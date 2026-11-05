import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDB } from "./db";
import { newId, randomToken, sha256Hex } from "./crypto";
import { decideParentAccess, PIN_UNLOCK_MINUTES, type ParentAccess } from "@/domain/access";

export const PARENT_COOKIE = "md_parent";
export const DEVICE_COOKIE = "md_device";
const PARENT_SESSION_DAYS = 30;
// ブラウザの Cookie 有効期限の上限は約400日。アクセスのたびに延長する
const DEVICE_COOKIE_DAYS = 400;

const cookieBase = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };

export interface ParentRow {
  id: string;
  family_id: string;
  email: string;
  name: string;
  pin_hash: string | null;
  must_change_password: number;
  pin_failed_count: number;
  pin_locked_until: string | null;
}

export interface ChildRow {
  id: string;
  family_id: string;
  name: string;
  grade: number;
  furigana_mode: string;
  allowance_amount: number;
  minutes_math: number;
  minutes_japanese: number;
  minutes_english: number;
  start_date: string;
  created_at: string;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

// ---------- 子ども端末 ----------

export interface DeviceContext {
  deviceId: string;
  child: ChildRow;
}

/** 端末トークン Cookie から子どもを特定する（解除済み・無効なら null） */
export async function getDeviceContext(): Promise<DeviceContext | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const db = await getDB();
  const hash = await sha256Hex(token);
  const row = await db
    .prepare(
      `SELECT d.id AS device_id, d.last_seen_at, c.*
         FROM devices d JOIN children c ON c.id = d.child_id
        WHERE d.token_hash = ? AND d.revoked_at IS NULL`,
    )
    .bind(hash)
    .first<ChildRow & { device_id: string; last_seen_at: string | null }>();
  if (!row) return null;
  const now = Date.now();
  if (!row.last_seen_at || now - Date.parse(row.last_seen_at) > 60 * 60 * 1000) {
    await db
      .prepare("UPDATE devices SET last_seen_at = ? WHERE id = ?")
      .bind(new Date(now).toISOString(), row.device_id)
      .run();
  }
  const { device_id, last_seen_at: _ignored, ...child } = row;
  return { deviceId: device_id, child };
}

/** 端末トークンを発行して Cookie に保存（Server Action / Route Handler から呼ぶ） */
export async function issueDeviceToken(childId: string, label: string): Promise<void> {
  const db = await getDB();
  const token = randomToken();
  await db
    .prepare("INSERT INTO devices (id, child_id, token_hash, label, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(newId(), childId, await sha256Hex(token), label, new Date().toISOString())
    .run();
  (await cookies()).set(DEVICE_COOKIE, token, { ...cookieBase, maxAge: DEVICE_COOKIE_DAYS * 86400 });
}

/** 有効な端末 Cookie の期限を延長する（Route Handler / Server Action でのみ書き込める） */
export async function refreshDeviceCookie(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(DEVICE_COOKIE)?.value;
  if (token) jar.set(DEVICE_COOKIE, token, { ...cookieBase, maxAge: DEVICE_COOKIE_DAYS * 86400 });
}

export async function requireChildPage(): Promise<DeviceContext> {
  const ctx = await getDeviceContext();
  if (!ctx) redirect("/welcome");
  return ctx;
}

// ---------- 親 ----------

export interface ParentContext {
  parent: ParentRow;
  sessionId: string;
  expiresAt: string;
  pinUnlockedUntil: string | null;
}

async function loadParentSession(): Promise<ParentContext | null> {
  const token = (await cookies()).get(PARENT_COOKIE)?.value;
  if (!token) return null;
  const db = await getDB();
  const row = await db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, s.pin_unlocked_until, p.*
         FROM parent_sessions s JOIN parents p ON p.id = s.parent_id
        WHERE s.token_hash = ?`,
    )
    .bind(await sha256Hex(token))
    .first<ParentRow & { session_id: string; expires_at: string; pin_unlocked_until: string | null }>();
  if (!row) return null;
  const { session_id, expires_at, pin_unlocked_until, ...parent } = row;
  return { parent, sessionId: session_id, expiresAt: expires_at, pinUnlockedUntil: pin_unlocked_until };
}

/** 親のアクセス判定。DB と Cookie を読み、純粋関数 decideParentAccess で決める */
export async function checkParent(requirePin: boolean): Promise<{ access: ParentAccess; ctx: ParentContext | null }> {
  const [device, ctx] = await Promise.all([getDeviceContext(), loadParentSession()]);
  const access = decideParentAccess({
    hasValidDevice: device !== null,
    session: ctx ? { expiresAt: ctx.expiresAt, pinUnlockedUntil: ctx.pinUnlockedUntil } : null,
    parent: ctx ? { pinHash: ctx.parent.pin_hash, mustChangePassword: ctx.parent.must_change_password === 1 } : null,
    now: new Date(),
    requirePin,
  });
  return { access, ctx };
}

async function extendPinUnlock(sessionId: string): Promise<void> {
  const db = await getDB();
  const until = new Date(Date.now() + PIN_UNLOCK_MINUTES * 60 * 1000).toISOString();
  await db.prepare("UPDATE parent_sessions SET pin_unlocked_until = ? WHERE id = ?").bind(until, sessionId).run();
}

function redirectFor(access: ParentAccess): never {
  switch (access.kind) {
    case "child_device":
      redirect("/child");
    case "login":
      redirect("/parent/login");
    case "set_pin":
    case "pin":
      redirect("/parent/pin");
    case "change_password":
      redirect("/parent/password");
    default:
      redirect("/parent/login");
  }
}

/** 親画面（Server Component）用。PIN まで確認できなければリダイレクト */
export async function requireParentPage(): Promise<ParentContext> {
  const { access, ctx } = await checkParent(true);
  if (access.kind !== "ok" || !ctx) redirectFor(access);
  await extendPinUnlock(ctx.sessionId);
  return ctx;
}

export class ForbiddenError extends Error {
  constructor(public access: ParentAccess["kind"]) {
    super(`forbidden: ${access}`);
  }
}

/** 親用の Server Action / API 用。権限がなければ例外（子ども端末からは必ず失敗する） */
export async function requireParentAction(): Promise<ParentContext> {
  const { access, ctx } = await checkParent(true);
  if (access.kind !== "ok" || !ctx) throw new ForbiddenError(access.kind);
  await extendPinUnlock(ctx.sessionId);
  return ctx;
}

export async function createParentSession(parentId: string, pinUnlocked: boolean): Promise<void> {
  const db = await getDB();
  const token = randomToken();
  const now = Date.now();
  const expires = new Date(now + PARENT_SESSION_DAYS * 86400 * 1000).toISOString();
  const pinUntil = pinUnlocked ? new Date(now + PIN_UNLOCK_MINUTES * 60 * 1000).toISOString() : null;
  await db
    .prepare(
      "INSERT INTO parent_sessions (id, parent_id, token_hash, created_at, expires_at, pin_unlocked_until) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(newId(), parentId, await sha256Hex(token), new Date(now).toISOString(), expires, pinUntil)
    .run();
  (await cookies()).set(PARENT_COOKIE, token, { ...cookieBase, maxAge: PARENT_SESSION_DAYS * 86400 });
}

export async function destroyParentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(PARENT_COOKIE)?.value;
  if (token) {
    const db = await getDB();
    await db.prepare("DELETE FROM parent_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  }
  jar.delete(PARENT_COOKIE);
}

/** 親のログイン状態だけを取得（PIN 入力画面など、PIN 前の画面用） */
export async function getParentContextWithoutPin(): Promise<{ access: ParentAccess; ctx: ParentContext | null }> {
  return checkParent(false);
}

export async function unlockPin(sessionId: string): Promise<void> {
  await extendPinUnlock(sessionId);
}
