// LINE の Webhook：友だち追加・連携コード・連携解除
import { NextResponse } from "next/server";
import { getDB } from "@/server/db";
import { verifyLineSignature, replyText } from "@/server/lineApi";
import { lineConfig, linkByCode, unlinkLineUser } from "@/server/notifications";
import { isRateLimited, recordFailure } from "@/server/rateLimit";
import { parseLinkCode } from "@/domain/notify";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  message?: { type: string; text?: string };
}

const GUIDE =
  "まいにちドリルの おしらせ用アカウントです。\nおうちの人の画面の「設定」→「LINE 通知」で「連携コードを発行」を押し、表示された6けたの数字をこのトークに送ってください。";

export async function POST(req: Request) {
  const cfg = await lineConfig();
  if (!cfg || !cfg.secret) return NextResponse.json({ error: "LINE が設定されていません" }, { status: 503 });
  const body = await req.text();
  if (!(await verifyLineSignature(cfg.secret, body, req.headers.get("x-line-signature")))) {
    return NextResponse.json({ error: "署名が正しくありません" }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ error: "形式が正しくありません" }, { status: 400 });
  }
  const db = await getDB();
  for (const ev of events) {
    const userId = ev.source?.type === "user" ? ev.source.userId : undefined;
    const reply = (text: string) => (ev.replyToken ? replyText(cfg, ev.replyToken, text) : Promise.resolve(false));
    if (!userId) {
      // グループやトークルームでは連携しない
      if (ev.type === "join") await reply("このアカウントは1対1のトークで使ってください。");
      continue;
    }
    if (ev.type === "follow") {
      await reply(GUIDE);
    } else if (ev.type === "unfollow") {
      await unlinkLineUser(db, userId);
    } else if (ev.type === "message" && ev.message?.type === "text") {
      const text = (ev.message.text ?? "").trim();
      if (/^(解除|かいじょ|停止)$/.test(text)) {
        const ok = await unlinkLineUser(db, userId);
        await reply(ok ? "通知の連携を解除しました。" : "このLINEは連携されていません。");
        continue;
      }
      const code = parseLinkCode(text);
      if (!code) {
        await reply(GUIDE);
        continue;
      }
      const key = `line:${userId}`;
      if (await isRateLimited(key, 10, 10 * 60)) {
        await reply("まちがいが続いたので、10分たってからもう一度送ってください。");
        continue;
      }
      const name = await linkByCode(db, code, userId);
      if (name === null) {
        await recordFailure(key, 10 * 60);
        await reply("コードがちがうか、有効期限（10分）がすぎています。おうちの人の画面でもう一度発行してください。");
      } else {
        await reply(`通知の連携ができました（${name}）。\nドリルが終わったときや、決まった時刻に終わっていないときにお知らせします。\n（やめるときは「解除」と送ってください）`);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
