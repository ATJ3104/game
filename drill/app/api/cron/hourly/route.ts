// 毎時の処理（Cloudflare の Cron から worker.ts 経由で呼ばれる）。合言葉がなければ動かない
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDB } from "@/server/db";
import { runReminders } from "@/server/notifications";

export async function POST(req: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const secret = env.CRON_SECRET ?? "";
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // 動作確認用：合言葉を知っている呼び出しだけ、時刻を指定できる
  const at = req.headers.get("x-cron-now");
  const now = at && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date();
  const result = await runReminders(await getDB(), now);
  return NextResponse.json(result);
}
