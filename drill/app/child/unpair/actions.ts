"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDB } from "@/server/db";
import { verifySecret } from "@/server/crypto";
import { clientIp, DEVICE_COOKIE, getDeviceContext } from "@/server/auth";
import { clearFailures, isRateLimited, recordFailure } from "@/server/rateLimit";

export interface FormState {
  error?: string;
}

/**
 * 子ども端末の登録を、その端末から解除する（まちがえて登録したとき用）。
 * その子の家族のおうちの人のメールアドレスとパスワードが必要
 */
export async function unpairAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getDeviceContext();
  if (!ctx) redirect("/welcome");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const key = `unpair:${await clientIp()}:${ctx.deviceId}`;
  if (await isRateLimited(key, 5, 15 * 60)) return { error: "まちがいが続いたため、15分たってからやり直してください" };
  const db = await getDB();
  const parent = await db
    .prepare("SELECT password_hash FROM parents WHERE email = ? AND family_id = ?")
    .bind(email, ctx.child.family_id)
    .first<{ password_hash: string }>();
  if (!parent || !(await verifySecret(password, parent.password_hash))) {
    await recordFailure(key, 15 * 60);
    return { error: "メールアドレスかパスワードが違います（この子どもの家族のおうちの人のもの）" };
  }
  await clearFailures(key);
  await db.prepare("UPDATE devices SET revoked_at = ? WHERE id = ?").bind(new Date().toISOString(), ctx.deviceId).run();
  (await cookies()).delete(DEVICE_COOKIE);
  redirect("/welcome");
}
