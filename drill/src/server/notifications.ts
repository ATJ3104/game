// LINE 通知：連携・完了通知・決まった時刻のお知らせ
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ChildRow } from "./auth";
import { randomDigits, sha256Hex } from "./crypto";
import { childSubjects, getFamilySettings, listChildren } from "./repo";
import { pushText, type LineConfig } from "./lineApi";
import { studyDateOf } from "@/domain/dates";
import { SUBJECT_LABEL, type Subject } from "@/domain/settings";
import {
  allCompleteMessage,
  allDone,
  completeMessage,
  jstHour,
  reminderMessage,
  type ChildToday,
  type CompleteMode,
  type SubjectStatus,
} from "@/domain/notify";

export async function lineConfig(): Promise<(LineConfig & { secret: string; botId: string }) | null> {
  const { env } = await getCloudflareContext({ async: true });
  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN ?? "";
  if (!accessToken) return null;
  return {
    accessToken,
    apiBase: env.LINE_API_BASE || "https://api.line.me",
    secret: env.LINE_CHANNEL_SECRET ?? "",
    botId: env.LINE_BOT_ID ?? "",
  };
}

/** LINE の友だち追加 URL（ボットの ID が設定されていれば） */
export async function lineAddFriendUrl(): Promise<string | null> {
  const { env } = await getCloudflareContext({ async: true });
  const id = (env.LINE_BOT_ID ?? "").trim();
  return id ? `https://line.me/R/ti/p/${encodeURIComponent(id.startsWith("@") ? id : `@${id}`)}` : null;
}

// ---------- 連携 ----------

export interface LineLink {
  parent_id: string;
  line_user_id: string;
  notify_complete: CompleteMode;
  notify_reminder: number;
  linked_at: string;
}

export async function getLineLink(db: D1Database, parentId: string): Promise<LineLink | null> {
  return db.prepare("SELECT * FROM line_links WHERE parent_id = ?").bind(parentId).first<LineLink>();
}

/** 連携コード（6けた・10分）を発行。前のコードは消す */
export async function createLinkCode(db: D1Database, parentId: string): Promise<{ code: string; expiresAt: string }> {
  const now = Date.now();
  await db.prepare("DELETE FROM line_link_codes WHERE parent_id = ? OR expires_at < ?").bind(parentId, new Date(now - 86400_000).toISOString()).run();
  for (let i = 0; i < 5; i++) {
    const code = randomDigits(6);
    const expiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    try {
      await db
        .prepare("INSERT INTO line_link_codes (code_hash, parent_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(await sha256Hex(`line:${code}`), parentId, expiresAt, new Date(now).toISOString())
        .run();
      return { code, expiresAt };
    } catch {
      // まれに重複したら作り直す
    }
  }
  throw new Error("連携コードを発行できませんでした");
}

/** LINE で送られたコードで、その LINE ユーザーを親にひもづける。成功したら親の名前 */
export async function linkByCode(db: D1Database, code: string, lineUserId: string): Promise<string | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `UPDATE line_link_codes SET used_at = ?
        WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?
        RETURNING parent_id`,
    )
    .bind(now, await sha256Hex(`line:${code}`), now)
    .first<{ parent_id: string }>();
  if (!row) return null;
  await db.batch([
    // 同じ LINE ユーザーがほかの親に連携していたら外す（1つの LINE は1人の親に）
    db.prepare("DELETE FROM line_links WHERE line_user_id = ? AND parent_id <> ?").bind(lineUserId, row.parent_id),
    db
      .prepare(
        `INSERT INTO line_links (parent_id, line_user_id, linked_at) VALUES (?, ?, ?)
         ON CONFLICT(parent_id) DO UPDATE SET line_user_id = excluded.line_user_id, linked_at = excluded.linked_at`,
      )
      .bind(row.parent_id, lineUserId, now),
  ]);
  const p = await db.prepare("SELECT name FROM parents WHERE id = ?").bind(row.parent_id).first<{ name: string }>();
  return p?.name ?? "";
}

export async function unlinkLineUser(db: D1Database, lineUserId: string): Promise<boolean> {
  const res = await db.prepare("DELETE FROM line_links WHERE line_user_id = ?").bind(lineUserId).run();
  return !!res.meta.changes;
}

// ---------- 今日の様子 ----------

interface ChildTodayEx extends ChildToday {
  id: string;
  minutes: number;
  correct: number;
  total: number;
  completedAt: string | null;
}

export async function familyToday(db: D1Database, familyId: string, today: string): Promise<ChildTodayEx[]> {
  const children = await listChildren(db, familyId);
  return Promise.all(
    children.map(async (c) => {
      const [subjects, sessions, done, special] = await Promise.all([
        childSubjects(db, c.id),
        db
          .prepare("SELECT subject, status, active_seconds, eval_total, eval_correct FROM sessions WHERE child_id = ? AND study_date = ?")
          .bind(c.id, today)
          .all<{ subject: Subject; status: SubjectStatus; active_seconds: number; eval_total: number | null; eval_correct: number | null }>(),
        db
          .prepare("SELECT completed_at FROM daily_completion WHERE child_id = ? AND study_date = ?")
          .bind(c.id, today)
          .first<{ completed_at: string }>(),
        db.prepare("SELECT 1 FROM special_days WHERE child_id = ? AND date = ?").bind(c.id, today).first(),
      ]);
      const bySubject = new Map(sessions.results.map((s) => [s.subject, s]));
      return {
        id: c.id,
        name: c.name,
        done: !!done,
        special: !!special,
        subjects: subjects.map((s) => ({ label: SUBJECT_LABEL[s], status: bySubject.get(s)?.status ?? "not_started" })),
        minutes: Math.round(sessions.results.reduce((t, s) => t + s.active_seconds, 0) / 60),
        correct: sessions.results.reduce((t, s) => t + (s.eval_correct ?? 0), 0),
        total: sessions.results.reduce((t, s) => t + (s.eval_total ?? 0), 0),
        completedAt: done?.completed_at ?? null,
      };
    }),
  );
}

// ---------- 送信 ----------

async function familyLinks(db: D1Database, familyId: string): Promise<LineLink[]> {
  const res = await db
    .prepare("SELECT l.* FROM line_links l JOIN parents p ON p.id = l.parent_id WHERE p.family_id = ?")
    .bind(familyId)
    .all<LineLink>();
  return res.results;
}

/** 同じ通知を二度送らないよう、送る権利を取る（取れたら true） */
async function claim(db: D1Database, familyId: string, date: string, key: string): Promise<boolean> {
  const res = await db
    .prepare("INSERT INTO notification_log (family_id, study_date, key, sent_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(familyId, date, key, new Date().toISOString())
    .run();
  return !!res.meta.changes;
}

/** 子どもが今日のドリルを終えたとき（学習の完了処理から呼ぶ。失敗しても学習には影響させない） */
export async function notifyDayComplete(db: D1Database, child: ChildRow, studyDate: string): Promise<void> {
  try {
    const cfg = await lineConfig();
    if (!cfg) return;
    const links = await familyLinks(db, child.family_id);
    if (links.length === 0) return;
    const kids = await familyToday(db, child.family_id, studyDate);
    const me = kids.find((k) => k.id === child.id);
    const each = links.filter((l) => l.notify_complete === "each");
    if (me && each.length && (await claim(db, child.family_id, studyDate, `complete:${child.id}`))) {
      const text = completeMessage({
        name: me.name,
        completedAt: me.completedAt ?? new Date().toISOString(),
        minutes: me.minutes,
        correct: me.correct,
        total: me.total,
      });
      await Promise.all(each.map((l) => pushText(cfg, l.line_user_id, text)));
    }
    const all = links.filter((l) => l.notify_complete === "all");
    if (all.length && allDone(kids) && (await claim(db, child.family_id, studyDate, "all_complete"))) {
      const text = allCompleteMessage(kids.filter((k) => k.done).map((k) => k.name));
      await Promise.all(all.map((l) => pushText(cfg, l.line_user_id, text)));
    }
  } catch (e) {
    console.error("notifyDayComplete", e);
  }
}

/** 毎時のお知らせ（cron から）。家族ごとの時刻になっていて、終わっていない子がいれば送る */
export async function runReminders(db: D1Database, now = new Date()): Promise<{ families: number; sent: number }> {
  const cfg = await lineConfig();
  if (!cfg) return { families: 0, sent: 0 };
  const fams = await db
    .prepare(
      `SELECT DISTINCT p.family_id FROM line_links l JOIN parents p ON p.id = l.parent_id WHERE l.notify_reminder = 1`,
    )
    .all<{ family_id: string }>();
  let sent = 0;
  for (const { family_id } of fams.results) {
    const settings = await getFamilySettings(db, family_id);
    if (jstHour(now) !== settings.reminderHour) continue;
    const today = studyDateOf(now, settings.dayBoundaryHour);
    const text = reminderMessage(await familyToday(db, family_id, today), settings.reminderHour);
    if (!text || !(await claim(db, family_id, today, "reminder"))) continue;
    const links = (await familyLinks(db, family_id)).filter((l) => l.notify_reminder === 1);
    const results = await Promise.all(links.map((l) => pushText(cfg, l.line_user_id, text)));
    sent += results.filter(Boolean).length;
  }
  return { families: fams.results.length, sent };
}

