"use server";

import { revalidatePath } from "next/cache";
import { getDB } from "@/server/db";
import { requireParentAction } from "@/server/auth";
import { newId } from "@/server/crypto";
import { getChildOfFamily, getFamilySettings } from "@/server/repo";
import { finalizeMonths, loadRecords } from "@/server/summary";
import { dateRange, isValidDate, studyDateOf, yearMonthOf } from "@/domain/dates";
import { SPECIAL_REASONS as REASONS } from "@/domain/specialDays";

export interface FormState {
  error?: string;
  ok?: string;
}


function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** 特別休みを変えたら、その日を含む「終わった月」の結果を計算し直す（支払い済みは残す） */
async function recompute(db: D1Database, familyId: string, childId: string, dates: string[]): Promise<void> {
  const child = await getChildOfFamily(db, familyId, childId);
  if (!child) return;
  const settings = await getFamilySettings(db, familyId);
  const today = studyDateOf(new Date(), settings.dayBoundaryHour);
  const months = [...new Set(dates.map(yearMonthOf))].filter((ym) => ym < yearMonthOf(today));
  const rec = await loadRecords(db, childId);
  await finalizeMonths(db, child, settings, rec, today, { force: true, months });
}

export async function addSpecialDaysAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const childIds = fd.getAll("child_id").filter((v): v is string => typeof v === "string");
  const from = str(fd, "from");
  const to = str(fd, "to") || from;
  const reason = str(fd, "reason");
  const memo = str(fd, "memo").slice(0, 200);
  if (childIds.length === 0) return { error: "子どもを選んでください" };
  if (!isValidDate(from) || !isValidDate(to)) return { error: "日付を正しく入力してください" };
  if (to < from) return { error: "終わりの日は、始めの日より後にしてください" };
  const dates = dateRange(from, to);
  if (dates.length > 62) return { error: "一度に登録できるのは62日までです" };
  if (!REASONS[reason]) return { error: "理由を選んでください" };
  if (reason === "other" && !memo) return { error: "「その他」のときはメモを入力してください" };

  const now = new Date().toISOString();
  for (const childId of childIds) {
    const child = await getChildOfFamily(db, parent.family_id, childId);
    if (!child) return { error: "子どもが見つかりません" };
    await db.batch(
      dates.map((d) =>
        db
          .prepare(
            `INSERT INTO special_days (id, child_id, date, reason, memo, created_by_parent_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(child_id, date) DO UPDATE SET reason = excluded.reason, memo = excluded.memo,
               created_by_parent_id = excluded.created_by_parent_id, created_at = excluded.created_at`,
          )
          .bind(newId(), childId, d, reason, memo || null, parent.id, now),
      ),
    );
    await recompute(db, parent.family_id, childId, dates);
  }
  revalidatePath("/parent", "layout");
  return { ok: `${dates.length}日分を特別休みにしました` };
}

export async function deleteSpecialDayAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const row = await db
    .prepare(
      `DELETE FROM special_days WHERE id = ? AND child_id IN (SELECT id FROM children WHERE family_id = ?)
       RETURNING child_id, date`,
    )
    .bind(str(fd, "id"), parent.family_id)
    .first<{ child_id: string; date: string }>();
  if (!row) return { error: "見つかりません" };
  await recompute(db, parent.family_id, row.child_id, [row.date]);
  revalidatePath("/parent", "layout");
  return { ok: "取り消しました" };
}
