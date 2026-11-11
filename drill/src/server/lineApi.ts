// LINE Messaging API の呼び出し（Next.js に依存しないのでテストからも使える）

const enc = new TextEncoder();

function toBase64(buf: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Webhook の署名（X-Line-Signature）を確かめる：チャネルシークレットでの HMAC-SHA256（Base64） */
export async function verifyLineSignature(channelSecret: string, body: string, signature: string | null): Promise<boolean> {
  if (!signature || !channelSecret) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(channelSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = toBase64(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

export interface LineConfig {
  accessToken: string;
  /** テストでは差しかえる。ふだんは https://api.line.me */
  apiBase: string;
}

async function call(cfg: LineConfig, path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.accessToken}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error(`LINE ${path} ${res.status} ${await res.text().catch(() => "")}`);
    return res.ok;
  } catch (e) {
    console.error(`LINE ${path} failed`, e);
    return false;
  }
}

/** ひとりに送る（プッシュメッセージ。無料プランの通数に数えられる） */
export function pushText(cfg: LineConfig, to: string, text: string): Promise<boolean> {
  return call(cfg, "/v2/bot/message/push", { to, messages: [{ type: "text", text }] });
}

/** Webhook への返信（通数に数えられない） */
export function replyText(cfg: LineConfig, replyToken: string, text: string): Promise<boolean> {
  return call(cfg, "/v2/bot/message/reply", { replyToken, messages: [{ type: "text", text }] });
}
