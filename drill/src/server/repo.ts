import type { ChildRow } from "./auth";
import { parseSettings, type FamilySettings, type Subject } from "@/domain/settings";

export async function getFamilySettings(db: D1Database, familyId: string): Promise<FamilySettings> {
  const row = await db
    .prepare("SELECT settings_json FROM family_settings WHERE family_id = ?")
    .bind(familyId)
    .first<{ settings_json: string }>();
  return parseSettings(row?.settings_json);
}

/** 家族に属する子どもだけを返す（他の家族の子どもは null） */
export async function getChildOfFamily(db: D1Database, familyId: string, childId: string): Promise<ChildRow | null> {
  return db
    .prepare("SELECT * FROM children WHERE id = ? AND family_id = ?")
    .bind(childId, familyId)
    .first<ChildRow>();
}

export async function listChildren(db: D1Database, familyId: string): Promise<ChildRow[]> {
  const res = await db
    .prepare("SELECT * FROM children WHERE family_id = ? ORDER BY grade, created_at")
    .bind(familyId)
    .all<ChildRow>();
  return res.results;
}

export async function getChildLevel(db: D1Database, childId: string, subject: Subject): Promise<string | null> {
  const row = await db
    .prepare("SELECT level_code FROM child_levels WHERE child_id = ? AND subject = ?")
    .bind(childId, subject)
    .first<{ level_code: string }>();
  return row?.level_code ?? null;
}

export function minutesFor(child: ChildRow, subject: Subject): number {
  if (subject === "math") return child.minutes_math;
  if (subject === "japanese") return child.minutes_japanese;
  return child.minutes_english;
}
