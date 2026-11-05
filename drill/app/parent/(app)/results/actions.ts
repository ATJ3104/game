"use server";

import { revalidatePath } from "next/cache";
import { getDB } from "@/server/db";
import { requireParentAction } from "@/server/auth";

export interface FormState {
  error?: string;
  ok?: string;
}

/** お小遣い支払い済みのチェック（もう一度押すと取り消し） */
export async function togglePaidAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const childId = String(fd.get("child_id") ?? "");
  const ym = String(fd.get("year_month") ?? "");
  const res = await db
    .prepare(
      `UPDATE monthly_results SET paid_at = CASE WHEN paid_at IS NULL THEN ? ELSE NULL END
        WHERE child_id = ? AND year_month = ? AND achieved = 1
          AND child_id IN (SELECT id FROM children WHERE family_id = ?)`,
    )
    .bind(new Date().toISOString(), childId, ym, parent.family_id)
    .run();
  revalidatePath("/parent/results");
  return res.meta.changes ? { ok: "更新しました" } : { error: "更新できませんでした" };
}
