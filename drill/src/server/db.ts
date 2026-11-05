import { getCloudflareContext } from "@opennextjs/cloudflare";

/** D1 データベース（wrangler.jsonc の binding "DB"）を取得する */
export async function getDB(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
