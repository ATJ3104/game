"use server";

import { redirect } from "next/navigation";
import { getDB } from "@/server/db";
import { hashSecret, newId, verifySecret } from "@/server/crypto";
import {
  clientIp,
  createParentSession,
  destroyParentSession,
  getDeviceContext,
  getParentContextWithoutPin,
  unlockPin,
} from "@/server/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/server/rateLimit";
import {
  isValidEmail,
  isValidPassword,
  isValidPin,
  PIN_LOCK_MINUTES,
  PIN_MAX_FAILURES,
} from "@/domain/access";
import { DEFAULT_SETTINGS } from "@/domain/settings";

export interface FormState {
  error?: string;
  ok?: string;
}

const CHILD_DEVICE_ERROR = "この端末は子ども用として登録されています。おうちの人の画面は使えません。";

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await getDeviceContext()) return { error: CHILD_DEVICE_ERROR };
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = (fd.get("password") as string | null) ?? "";
  const pin = str(fd, "pin");
  const pin2 = str(fd, "pin2");
  if (!name || name.length > 30) return { error: "お名前を入力してください（30文字まで）" };
  if (!isValidEmail(email)) return { error: "メールアドレスの形式が正しくありません" };
  if (!isValidPassword(password)) return { error: "パスワードは8文字以上にしてください" };
  if (!isValidPin(pin)) return { error: "PIN は4桁の数字にしてください" };
  if (pin !== pin2) return { error: "PIN が一致しません" };

  const db = await getDB();
  const exists = await db.prepare("SELECT 1 FROM parents WHERE email = ?").bind(email).first();
  if (exists) return { error: "このメールアドレスはすでに登録されています" };

  const now = new Date().toISOString();
  const familyId = newId();
  const parentId = newId();
  await db.batch([
    db.prepare("INSERT INTO families (id, created_at) VALUES (?, ?)").bind(familyId, now),
    db
      .prepare("INSERT INTO family_settings (family_id, settings_json, updated_at) VALUES (?, ?, ?)")
      .bind(familyId, JSON.stringify(DEFAULT_SETTINGS), now),
    db
      .prepare(
        "INSERT INTO parents (id, family_id, email, password_hash, pin_hash, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(parentId, familyId, email, await hashSecret(password), await hashSecret(pin), name, now),
  ]);
  await createParentSession(parentId, true);
  redirect("/parent");
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await getDeviceContext()) return { error: CHILD_DEVICE_ERROR };
  const email = str(fd, "email").toLowerCase();
  const password = (fd.get("password") as string | null) ?? "";
  const key = `login:${await clientIp()}:${email}`;
  if (await isRateLimited(key, 10, 15 * 60)) {
    return { error: "失敗が続いたため、しばらく（15分）ログインできません" };
  }
  const db = await getDB();
  const parent = await db
    .prepare("SELECT id, password_hash FROM parents WHERE email = ?")
    .bind(email)
    .first<{ id: string; password_hash: string }>();
  if (!parent || !(await verifySecret(password, parent.password_hash))) {
    await recordFailure(key, 15 * 60);
    return { error: "メールアドレスかパスワードが違います" };
  }
  await clearFailures(key);
  await createParentSession(parent.id, false);
  redirect("/parent/pin");
}

export async function pinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { access, ctx } = await getParentContextWithoutPin();
  if (access.kind === "child_device") return { error: CHILD_DEVICE_ERROR };
  if (!ctx || access.kind === "login") redirect("/parent/login");
  if (access.kind === "change_password") redirect("/parent/password");
  const db = await getDB();
  const pin = str(fd, "pin");
  const parent = ctx.parent;

  // 初回：PIN を決める
  if (!parent.pin_hash) {
    if (!isValidPin(pin)) return { error: "PIN は4桁の数字にしてください" };
    if (pin !== str(fd, "pin2")) return { error: "PIN が一致しません" };
    await db.prepare("UPDATE parents SET pin_hash = ? WHERE id = ?").bind(await hashSecret(pin), parent.id).run();
    await unlockPin(ctx.sessionId);
    redirect("/parent");
  }

  if (parent.pin_locked_until && Date.parse(parent.pin_locked_until) > Date.now()) {
    return { error: `PIN を${PIN_MAX_FAILURES}回まちがえたため、${PIN_LOCK_MINUTES}分間ロックしています` };
  }
  if (!isValidPin(pin) || !(await verifySecret(pin, parent.pin_hash))) {
    const failed = parent.pin_failed_count + 1;
    if (failed >= PIN_MAX_FAILURES) {
      const until = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000).toISOString();
      await db
        .prepare("UPDATE parents SET pin_failed_count = 0, pin_locked_until = ? WHERE id = ?")
        .bind(until, parent.id)
        .run();
      return { error: `PIN を${PIN_MAX_FAILURES}回まちがえたため、${PIN_LOCK_MINUTES}分間ロックします` };
    }
    await db.prepare("UPDATE parents SET pin_failed_count = ? WHERE id = ?").bind(failed, parent.id).run();
    return { error: `PIN が違います（あと${PIN_MAX_FAILURES - failed}回）` };
  }
  await db
    .prepare("UPDATE parents SET pin_failed_count = 0, pin_locked_until = NULL WHERE id = ?")
    .bind(parent.id)
    .run();
  await unlockPin(ctx.sessionId);
  redirect("/parent");
}

/** 仮パスワード（2人目の親）からの変更 */
export async function changePasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { access, ctx } = await getParentContextWithoutPin();
  if (access.kind === "child_device") return { error: CHILD_DEVICE_ERROR };
  if (!ctx || access.kind === "login") redirect("/parent/login");
  const password = (fd.get("password") as string | null) ?? "";
  if (!isValidPassword(password)) return { error: "パスワードは8文字以上にしてください" };
  if (password !== ((fd.get("password2") as string | null) ?? "")) return { error: "パスワードが一致しません" };
  const db = await getDB();
  await db
    .prepare("UPDATE parents SET password_hash = ?, must_change_password = 0 WHERE id = ?")
    .bind(await hashSecret(password), ctx.parent.id)
    .run();
  redirect("/parent/pin");
}

export async function logoutAction(): Promise<void> {
  await destroyParentSession();
  redirect("/parent/login");
}
