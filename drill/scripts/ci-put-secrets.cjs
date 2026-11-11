// CI 用：Worker の secret をまとめて設定する
// - CRON_SECRET：毎回ランダムに作り直す（毎時の Cron が内部の API を呼ぶときの合言葉）
// - LINE_*：GitHub の Secrets に登録されていれば設定する（なければ LINE 通知は動かないだけ）
const { execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const secrets = { CRON_SECRET: crypto.randomBytes(32).toString("hex") };
for (const name of ["LINE_CHANNEL_ACCESS_TOKEN", "LINE_CHANNEL_SECRET", "LINE_BOT_ID"]) {
  const v = (process.env[name] || "").trim();
  if (v) secrets[name] = v;
}

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "secrets-")), "secrets.json");
fs.writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
try {
  execFileSync("npx", ["wrangler", "secret", "bulk", file], { stdio: "inherit" });
} finally {
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
}
console.log("設定した secret:", Object.keys(secrets).join(", "));
if (!secrets.LINE_CHANNEL_ACCESS_TOKEN) console.log("LINE の secret は未登録です（LINE 通知はオフのまま）");
