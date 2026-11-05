"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDB } from "@/server/db";
import { sha256Hex } from "@/server/crypto";
import { clientIp, destroyParentSession, getDeviceContext, issueDeviceToken, PARENT_COOKIE } from "@/server/auth";
import { isRateLimited, recordFailure } from "@/server/rateLimit";

export interface FormState {
  error?: string;
}

function deviceLabel(ua: string): string {
  const kind = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : "端末";
  const d = new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" });
  return `${kind}（${d} 登録）`;
}

export async function pairAction(_prev: FormState, fd: FormData): Promise<FormState> {
  if (await getDeviceContext()) redirect("/child");
  const code = String(fd.get("code") ?? "").replace(/\D/g, "");
  const key = `pair:${await clientIp()}`;
  if (await isRateLimited(key, 10, 10 * 60)) {
    return { error: "まちがいが おおいので、10ぷん まってから やりなおしてね" };
  }
  if (code.length !== 6) return { error: "6けたの すうじを いれてね" };
  const db = await getDB();
  const now = new Date().toISOString();
  // 未使用・期限内のコードを「使用済み」に更新できたときだけ成功（同時に2台で使われるのを防ぐ）
  const row = await db
    .prepare(
      `UPDATE pairing_codes SET used_at = ?
        WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
        RETURNING child_id`,
    )
    .bind(now, await sha256Hex(code), now)
    .first<{ child_id: string }>();
  if (!row) {
    await recordFailure(key, 10 * 60);
    return { error: "コードが ちがうか、じかんぎれ です。おうちの人に もういちど だしてもらってね" };
  }
  // このブラウザで親がログインしていたら、ログアウトさせる（子ども端末では親画面を使わせない）
  if ((await cookies()).get(PARENT_COOKIE)) await destroyParentSession();
  const ua = (await headers()).get("user-agent") ?? "";
  await issueDeviceToken(row.child_id, deviceLabel(ua));
  redirect("/child");
}
