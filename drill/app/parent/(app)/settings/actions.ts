"use server";

import { revalidatePath } from "next/cache";
import { getDB } from "@/server/db";
import { requireParentAction } from "@/server/auth";
import { hashSecret, newId, randomDigits, sha256Hex } from "@/server/crypto";
import { getChildOfFamily, getFamilySettings } from "@/server/repo";
import { studyDateOf } from "@/domain/dates";
import { availableLevels } from "@/domain/levels";
import { levelOptions } from "@/server/contentPolicy";
import { isValidEmail, isValidPassword } from "@/domain/access";
import { parseSettings, type Subject } from "@/domain/settings";

export interface FormState {
  error?: string;
  ok?: string;
}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function int(fd: FormData, key: string, min: number, max: number): number | null {
  const s = str(fd, key);
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= min && n <= max ? n : null;
}

const FURIGANA = ["none", "furigana", "hiragana"];
const LEVEL_SUBJECTS: Subject[] = ["math", "japanese", "english"];

function isSelectable(subject: Subject, code: string): boolean {
  return availableLevels(subject, levelOptions()).some((l) => l.code === code);
}

export async function addChildAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const name = str(fd, "name");
  const grade = int(fd, "grade", 1, 6);
  const minutes = int(fd, "minutes_math", 1, 120);
  const minutesJa = int(fd, "minutes_japanese", 1, 120) ?? 10;
  const minutesEn = int(fd, "minutes_english", 1, 120) ?? 10;
  const level = str(fd, "level_math");
  const levelJa = str(fd, "level_japanese");
  const levelEn = str(fd, "level_english");
  if (!name || name.length > 20) return { error: "名前を入力してください（20文字まで）" };
  if (grade === null) return { error: "学年を選んでください" };
  if (minutes === null) return { error: "算数の時間は1〜120分で入力してください" };
  if (!isSelectable("math", level)) return { error: "算数の初期レベルを選んでください" };
  if (levelJa && levelJa !== "none" && !isSelectable("japanese", levelJa)) return { error: "国語の初期レベルを選んでください" };
  if (levelEn && levelEn !== "none" && !isSelectable("english", levelEn)) return { error: "英語の初期レベルを選んでください" };
  const db = await getDB();
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM children WHERE family_id = ?")
    .bind(parent.family_id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) return { error: "これ以上登録できません" };
  // 同じ名前の二重登録を防ぐ（「追加」を何度も押してしまったとき）
  if (await db.prepare("SELECT 1 FROM children WHERE family_id = ? AND name = ?").bind(parent.family_id, name).first()) {
    return { error: `「${name}」さんはすでに登録されています。内容を変えるときは、上のその子の欄で「保存」を押してください` };
  }
  const settings = await getFamilySettings(db, parent.family_id);
  const now = new Date();
  const childId = newId();
  await db.batch([
    db
      .prepare(
        `INSERT INTO children (id, family_id, name, grade, furigana_mode, minutes_math, minutes_japanese, minutes_english, start_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        childId,
        parent.family_id,
        name,
        grade,
        grade <= 1 ? "hiragana" : "none",
        minutes,
        minutesJa,
        minutesEn,
        studyDateOf(now, settings.dayBoundaryHour),
        now.toISOString(),
      ),
    db
      .prepare("INSERT INTO child_levels (child_id, subject, level_code, updated_at) VALUES (?, 'math', ?, ?)")
      .bind(childId, level, now.toISOString()),
    db
      .prepare(
        "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, 'math', NULL, ?, 'initial', ?)",
      )
      .bind(newId(), childId, level, now.toISOString()),
    ...(levelJa && levelJa !== "none"
      ? [
          db
            .prepare("INSERT INTO child_levels (child_id, subject, level_code, updated_at) VALUES (?, 'japanese', ?, ?)")
            .bind(childId, levelJa, now.toISOString()),
          db
            .prepare(
              "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, 'japanese', NULL, ?, 'initial', ?)",
            )
            .bind(newId(), childId, levelJa, now.toISOString()),
        ]
      : []),
    ...(levelEn && levelEn !== "none"
      ? [
          db
            .prepare("INSERT INTO child_levels (child_id, subject, level_code, updated_at) VALUES (?, 'english', ?, ?)")
            .bind(childId, levelEn, now.toISOString()),
          db
            .prepare(
              "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, 'english', NULL, ?, 'initial', ?)",
            )
            .bind(newId(), childId, levelEn, now.toISOString()),
        ]
      : []),
  ]);
  revalidatePath("/parent", "layout");
  return { ok: `${name} さんを登録しました` };
}

export async function updateChildAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, str(fd, "child_id"));
  if (!child) return { error: "子どもが見つかりません" };
  const name = str(fd, "name");
  const grade = int(fd, "grade", 1, 6);
  const minutes = int(fd, "minutes_math", 1, 120);
  const minutesJa = int(fd, "minutes_japanese", 1, 120);
  const minutesEn = int(fd, "minutes_english", 1, 120);
  const allowance = int(fd, "allowance_amount", 0, 1_000_000);
  const furigana = str(fd, "furigana_mode");
  if (!name || name.length > 20) return { error: "名前を入力してください（20文字まで）" };
  if (grade === null) return { error: "学年を選んでください" };
  if (minutes === null) return { error: "算数の時間は1〜120分で入力してください" };
  if (minutesJa === null) return { error: "国語の時間は1〜120分で入力してください" };
  if (minutesEn === null) return { error: "英語の時間は1〜120分で入力してください" };
  if (allowance === null) return { error: "お小遣いの金額を正しく入力してください" };
  if (!FURIGANA.includes(furigana)) return { error: "ふりがな設定を選んでください" };
  await db
    .prepare(
      "UPDATE children SET name = ?, grade = ?, minutes_math = ?, minutes_japanese = ?, minutes_english = ?, allowance_amount = ?, furigana_mode = ? WHERE id = ?",
    )
    .bind(name, grade, minutes, minutesJa, minutesEn, allowance, furigana, child.id)
    .run();
  revalidatePath("/parent", "layout");
  return { ok: "保存しました" };
}

export async function setLevelAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, str(fd, "child_id"));
  if (!child) return { error: "子どもが見つかりません" };
  const subject = str(fd, "subject") as Subject;
  if (!LEVEL_SUBJECTS.includes(subject)) return { error: "この教科はまだ使えません" };
  const level = str(fd, "level_code");
  const cur = await db
    .prepare("SELECT level_code FROM child_levels WHERE child_id = ? AND subject = ?")
    .bind(child.id, subject)
    .first<{ level_code: string }>();
  // 国語は「やらない」にもできる（算数は必須）
  if (level === "none") {
    if (subject === "math") return { error: "算数は「やらない」にできません" };
    if (!cur) return { ok: "変更はありません" };
    await db.prepare("DELETE FROM child_levels WHERE child_id = ? AND subject = ?").bind(child.id, subject).run();
    revalidatePath("/parent", "layout");
    return { ok: `${subject === "japanese" ? "国語" : "英語"}をメニューから外しました` };
  }
  if (!isSelectable(subject, level)) return { error: "レベルを選んでください" };
  if (cur?.level_code === level) return { ok: "変更はありません" };
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO child_levels (child_id, subject, level_code, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(child_id, subject) DO UPDATE SET level_code = excluded.level_code, updated_at = excluded.updated_at`,
      )
      .bind(child.id, subject, level, now),
    db
      .prepare(
        "INSERT INTO level_history (id, child_id, subject, from_level, to_level, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(newId(), child.id, subject, cur?.level_code ?? null, level, cur ? "manual" : "initial", now),
  ]);
  revalidatePath("/parent", "layout");
  return { ok: `レベルを ${level} にしました` };
}

export interface PairingState {
  error?: string;
  code?: string;
  expiresAt?: string;
}

export async function issuePairingCodeAction(_prev: PairingState, fd: FormData): Promise<PairingState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, str(fd, "child_id"));
  if (!child) return { error: "子どもが見つかりません" };
  const now = Date.now();
  // 同じ子どもの未使用コードは無効にしてから発行（期限切れのコードも掃除）
  await db.batch([
    db.prepare("DELETE FROM pairing_codes WHERE child_id = ? AND used_at IS NULL").bind(child.id),
    db.prepare("DELETE FROM pairing_codes WHERE expires_at < ?").bind(new Date(now - 86400_000).toISOString()),
  ]);
  for (let i = 0; i < 5; i++) {
    const code = randomDigits(6);
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    try {
      await db
        .prepare("INSERT INTO pairing_codes (code_hash, child_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(await sha256Hex(code), child.id, expiresAt, new Date(now).toISOString())
        .run();
      return { code, expiresAt };
    } catch {
      // まれにコードが重複したら作り直す
    }
  }
  return { error: "コードを発行できませんでした。もう一度お試しください" };
}

export async function revokeDeviceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const res = await db
    .prepare(
      `UPDATE devices SET revoked_at = ?
        WHERE id = ? AND revoked_at IS NULL
          AND child_id IN (SELECT id FROM children WHERE family_id = ?)`,
    )
    .bind(new Date().toISOString(), str(fd, "device_id"), parent.family_id)
    .run();
  revalidatePath("/parent", "layout");
  return res.meta.changes ? { ok: "端末の登録を解除しました" } : { error: "端末が見つかりません" };
}

export async function addParentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM parents WHERE family_id = ?")
    .bind(parent.family_id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 4) return { error: "おうちの人は4人まで登録できます" };
  const name = str(fd, "name");
  const email = str(fd, "email").toLowerCase();
  const password = (fd.get("password") as string | null) ?? "";
  if (!name || name.length > 30) return { error: "お名前を入力してください" };
  if (!isValidEmail(email)) return { error: "メールアドレスの形式が正しくありません" };
  if (!isValidPassword(password)) return { error: "仮パスワードは8文字以上にしてください" };
  if (await db.prepare("SELECT 1 FROM parents WHERE email = ?").bind(email).first()) {
    return { error: "このメールアドレスはすでに登録されています" };
  }
  await db
    .prepare(
      `INSERT INTO parents (id, family_id, email, password_hash, pin_hash, name, must_change_password, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, 1, ?)`,
    )
    .bind(newId(), parent.family_id, email, await hashSecret(password), name, new Date().toISOString())
    .run();
  revalidatePath("/parent/settings");
  return { ok: `${name} さんを追加しました。仮パスワードでログインすると、パスワードと PIN の設定を求められます` };
}

export async function updateFamilySettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const current = await getFamilySettings(db, parent.family_id);
  const boundary = int(fd, "dayBoundaryHour", 0, 23);
  const guess = int(fd, "guessMath", 0, 10000);
  const promoteAcc = int(fd, "promoteAccuracy", 0, 100);
  const promoteN = int(fd, "promoteSessions", 1, 20);
  const reviewAcc = int(fd, "reviewAccuracy", 0, 100);
  const reviewN = int(fd, "reviewSessions", 1, 20);
  if ([boundary, guess, promoteAcc, promoteN, reviewAcc, reviewN].some((v) => v === null)) {
    return { error: "入力内容を確認してください" };
  }
  const next = parseSettings(
    JSON.stringify({
      ...current,
      dayBoundaryHour: boundary,
      guessThresholdMs: { ...current.guessThresholdMs, math: guess },
      promoteAccuracy: promoteAcc! / 100,
      promoteSessions: promoteN,
      reviewAccuracy: reviewAcc! / 100,
      reviewSessions: reviewN,
    }),
  );
  await db
    .prepare(
      `INSERT INTO family_settings (family_id, settings_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(family_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
    )
    .bind(parent.family_id, JSON.stringify(next), new Date().toISOString())
    .run();
  revalidatePath("/parent", "layout");
  return { ok: "保存しました" };
}

// ---------- LINE 通知 ----------

export interface LineCodeState {
  error?: string;
  code?: string;
  expiresAt?: string;
}

export async function issueLineCodeAction(_prev: LineCodeState, _fd: FormData): Promise<LineCodeState> {
  const { parent } = await requireParentAction();
  const { createLinkCode } = await import("@/server/notifications");
  try {
    return await createLinkCode(await getDB(), parent.id);
  } catch {
    return { error: "コードを発行できませんでした。もう一度お試しください" };
  }
}

export async function updateLineSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const complete = str(fd, "notify_complete");
  if (!["each", "all", "off"].includes(complete)) return { error: "完了通知を選んでください" };
  const reminder = fd.get("notify_reminder") === "on" ? 1 : 0;
  const db = await getDB();
  const res = await db
    .prepare("UPDATE line_links SET notify_complete = ?, notify_reminder = ? WHERE parent_id = ?")
    .bind(complete, reminder, parent.id)
    .run();
  const hour = int(fd, "reminderHour", 15, 23);
  if (hour !== null) {
    const current = await getFamilySettings(db, parent.family_id);
    await db
      .prepare(
        `INSERT INTO family_settings (family_id, settings_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(family_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
      )
      .bind(parent.family_id, JSON.stringify({ ...current, reminderHour: hour }), new Date().toISOString())
      .run();
  }
  revalidatePath("/parent/settings");
  return res.meta.changes ? { ok: "保存しました" } : { error: "LINE が連携されていません" };
}

export async function unlinkLineAction(_prev: FormState, _fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  await (await getDB()).prepare("DELETE FROM line_links WHERE parent_id = ?").bind(parent.id).run();
  revalidatePath("/parent/settings");
  return { ok: "LINE の連携を解除しました" };
}

/** 子どもの削除。学習の記録がある子どもは消せない（まちがえて作った登録を消すためのもの） */
export async function deleteChildAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const db = await getDB();
  const child = await getChildOfFamily(db, parent.family_id, str(fd, "child_id"));
  if (!child) return { error: "子どもが見つかりません" };
  const used = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE child_id = ?").bind(child.id).first<{ n: number }>();
  if ((used?.n ?? 0) > 0) return { error: "学習の記録がある子どもは削除できません" };
  await db.batch([
    db.prepare("DELETE FROM pairing_codes WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM devices WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM child_levels WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM level_history WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM special_days WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM monthly_results WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM daily_completion WHERE child_id = ?").bind(child.id),
    db.prepare("DELETE FROM children WHERE id = ?").bind(child.id),
  ]);
  revalidatePath("/parent", "layout");
  return { ok: `${child.name} さんの登録を削除しました` };
}

// ---------- 家族アカウントをまとめる ----------

export async function issueFamilyInviteAction(_prev: LineCodeState, _fd: FormData): Promise<LineCodeState> {
  const { parent } = await requireParentAction();
  const { createFamilyInvite } = await import("@/server/familyJoin");
  try {
    return await createFamilyInvite(await getDB(), parent.family_id, parent.id);
  } catch {
    return { error: "コードを発行できませんでした。もう一度お試しください" };
  }
}

export async function joinFamilyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { parent } = await requireParentAction();
  const code = str(fd, "code").replace(/\D/g, "");
  if (code.length !== 8) return { error: "8けたの招待コードを入力してください" };
  if (fd.get("confirm") !== "on") return { error: "確認のチェックを入れてください" };
  const { joinFamily, MAX_PARENTS } = await import("@/server/familyJoin");
  const r = await joinFamily(await getDB(), parent, code);
  if (!r.ok) {
    return {
      error:
        r.reason === "same_family"
          ? "すでに同じ家族アカウントです"
          : r.reason === "full"
            ? `その家族アカウントは、おうちの人が${MAX_PARENTS}人で上限です`
            : "コードがちがうか、有効期限（30分）がすぎています",
    };
  }
  revalidatePath("/parent", "layout");
  return { ok: "家族アカウントに参加しました。これからは同じ子ども・同じ進み具合が表示されます" };
}

// ---------- パスワードの再設定 ----------

/** PIN を確かめる（パスワードの再設定など、大事な操作の前に） */
async function checkPin(ctx: Awaited<ReturnType<typeof requireParentAction>>, pin: string): Promise<string | null> {
  const { verifySecret } = await import("@/server/crypto");
  const { isRateLimited, recordFailure, clearFailures } = await import("@/server/rateLimit");
  const key = `pwreset:${ctx.parent.id}`;
  if (await isRateLimited(key, 5, 15 * 60)) return "PIN のまちがいが続いたため、15分たってからやり直してください";
  if (!ctx.parent.pin_hash || !/^\d{4}$/.test(pin) || !(await verifySecret(pin, ctx.parent.pin_hash))) {
    await recordFailure(key, 15 * 60);
    return "PIN が違います";
  }
  await clearFailures(key);
  return null;
}

/** 自分のパスワードを変える（今のパスワードを忘れていても、ログイン中なら PIN で変えられる） */
export async function changeMyPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireParentAction();
  const password = (fd.get("password") as string | null) ?? "";
  if (!isValidPassword(password)) return { error: "新しいパスワードは8文字以上にしてください" };
  if (password !== ((fd.get("password2") as string | null) ?? "")) return { error: "新しいパスワードが一致しません" };
  const pinError = await checkPin(ctx, str(fd, "pin"));
  if (pinError) return { error: pinError };
  const db = await getDB();
  await db.batch([
    db.prepare("UPDATE parents SET password_hash = ?, must_change_password = 0 WHERE id = ?").bind(await hashSecret(password), ctx.parent.id),
    // ほかの端末のログインは切る（この端末はそのまま）
    db.prepare("DELETE FROM parent_sessions WHERE parent_id = ? AND id <> ?").bind(ctx.parent.id, ctx.sessionId),
  ]);
  return { ok: "パスワードを変更しました。ほかの端末では、新しいパスワードでログインし直してください" };
}

/** 同じ家族のほかのおうちの人に、仮パスワードを設定する（本人が次のログインで自分のパスワードに変える） */
export async function resetParentPasswordAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const ctx = await requireParentAction();
  const targetId = str(fd, "parent_id");
  const password = (fd.get("password") as string | null) ?? "";
  if (targetId === ctx.parent.id) return { error: "自分のパスワードは上の「自分のパスワードを変更」で変えてください" };
  if (!isValidPassword(password)) return { error: "仮パスワードは8文字以上にしてください" };
  const db = await getDB();
  const target = await db
    .prepare("SELECT id, name FROM parents WHERE id = ? AND family_id = ?")
    .bind(targetId, ctx.parent.family_id)
    .first<{ id: string; name: string }>();
  if (!target) return { error: "おうちの人が見つかりません" };
  const pinError = await checkPin(ctx, str(fd, "pin"));
  if (pinError) return { error: pinError };
  await db.batch([
    db.prepare("UPDATE parents SET password_hash = ?, must_change_password = 1 WHERE id = ?").bind(await hashSecret(password), target.id),
    db.prepare("DELETE FROM parent_sessions WHERE parent_id = ?").bind(target.id),
  ]);
  return { ok: `${target.name} さんに仮パスワードを設定しました。次のログインで、本人が新しいパスワードに変えます（PIN はそのまま）` };
}
