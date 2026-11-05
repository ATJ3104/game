// CI 用：D1 データベース「mainichi-drill」がなければ作り、wrangler.jsonc の database_id を本物の ID に置きかえる
// （CI の作業コピーの中だけで書きかえる。リポジトリの wrangler.jsonc は仮の ID のまま）
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const NAME = "mainichi-drill";
const run = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

function findId() {
  const out = run("npx wrangler d1 list --json");
  const list = JSON.parse(out.slice(out.indexOf("[")));
  return list.find((d) => d.name === NAME)?.uuid ?? null;
}

let id = findId();
if (!id) {
  console.log(`D1「${NAME}」を作成します`);
  run(`npx wrangler d1 create ${NAME}`);
  id = findId();
}
if (!id) throw new Error("D1 の ID を取得できませんでした");

const file = path.join(__dirname, "..", "wrangler.jsonc");
const src = fs.readFileSync(file, "utf8");
const next = src.replace(/"database_id":\s*"[^"]*"/, `"database_id": "${id}"`);
if (next === src && !src.includes(id)) throw new Error("wrangler.jsonc の database_id を置きかえられませんでした");
fs.writeFileSync(file, next);
console.log(`D1「${NAME}」: ${id}`);
