// WebCrypto だけで実装（Workers / Node 両方で動く。追加の依存なし）

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Cookie 用のランダムなトークン（256bit） */
export function randomToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** n桁の数字コード（端末登録用）。剰余の偏りを避けるため棄却法を使う */
export function randomDigits(n: number): string {
  let s = "";
  while (s.length < n) {
    const [v] = crypto.getRandomValues(new Uint8Array(1));
    if (v !== undefined && v < 250) s += String(v % 10);
  }
  return s;
}

/** トークン・コードの保存用ハッシュ */
export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(value)));
}

// Cloudflare Workers の PBKDF2 は 100,000 回が上限
const PBKDF2_ITERATIONS = 100_000;

async function pbkdf2(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** パスワード・PIN のハッシュ。形式: pbkdf2$<回数>$<salt hex>$<hash hex> */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(secret, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [algo, iterStr, saltHex, hashHex] = stored.split("$");
  if (algo !== "pbkdf2" || !iterStr || !saltHex || !hashHex) return false;
  const actual = await pbkdf2(secret, fromHex(saltHex), Number(iterStr));
  const expected = fromHex(hashHex);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
