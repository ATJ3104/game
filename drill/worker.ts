// Cloudflare Workers の入口。OpenNext が作るアプリ本体（.open-next/worker.js）に、
// 毎時の Cron（LINE のお知らせ）を足したもの。wrangler.jsonc の main がこのファイルを指す。
// @ts-expect-error: `opennextjs-cloudflare build` で作られる
import handler from "./.open-next/worker.js";

// OpenNext が使う Durable Object のクラスもそのまま出す
// @ts-expect-error: `opennextjs-cloudflare build` で作られる
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    // アプリ本体の内部 API を、合言葉つきで呼ぶ
    const req = new Request("https://cron.internal/api/cron/hourly", {
      method: "POST",
      headers: { "x-cron-secret": env.CRON_SECRET ?? "" },
    });
    ctx.waitUntil(
      (handler.fetch(req, env, ctx) as Promise<Response>).then(async (res) => {
        console.log("cron hourly", res.status, await res.text());
      }),
    );
  },
};
