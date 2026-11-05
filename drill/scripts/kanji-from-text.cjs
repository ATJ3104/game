// 漢字データを1行形式のテキストから content/kanji/gradeN.json に変換する（教材づくり用）
// 使い方: node scripts/kanji-from-text.cjs <学年> <入力.txt> [入力2.txt ...]
//
// 書式（# で始まる行と空行は無視）
//   K 漢字|音読み,音読み|訓読み,訓読み
//   E 熟語|読み|例文|読みのまちがい,,|漢字のまちがい,,
const fs = require("node:fs");
const path = require("node:path");

const [gradeArg, ...inputs] = process.argv.slice(2);
const grade = Number(gradeArg);
if (!grade || inputs.length === 0) {
  console.error("使い方: node scripts/kanji-from-text.cjs <学年> <入力.txt> ...");
  process.exit(1);
}

/** "|" で区切る（ただし {漢字|よみ} の中の "|" は区切りにしない） */
function splitFields(s) {
  const out = [""];
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === "|" && depth === 0) out.push("");
    else out[out.length - 1] += ch;
  }
  return out;
}

const list = (s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const kanji = [];
for (const file of inputs) {
  fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith("#")) return;
      const at = `${path.basename(file)}:${i + 1}`;
      const [tag, rest] = [line.slice(0, 1), line.slice(2)];
      const f = splitFields(rest);
      if (tag === "K") {
        if (f.length !== 3) throw new Error(`${at}: K 行は3項目`);
        kanji.push({ kanji: f[0].trim(), on: list(f[1]), kun: list(f[2]), examples: [] });
      } else if (tag === "E") {
        if (f.length !== 5) throw new Error(`${at}: E 行は5項目`);
        const cur = kanji[kanji.length - 1];
        if (!cur) throw new Error(`${at}: E 行の前に K 行が必要`);
        cur.examples.push({
          word: f[0].trim(),
          reading: f[1].trim(),
          sentence: f[2].trim(),
          readWrong: list(f[3]),
          kanjiWrong: list(f[4]),
        });
      } else throw new Error(`${at}: 行の先頭は K か E`);
    });
}

const out = path.join(__dirname, "..", "content", "kanji", `grade${grade}.json`);
const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : null;
const doc = {
  grade,
  reviewed: prev?.reviewed ?? false,
  note: `学年別漢字配当表（${grade}年）。並びは配当表の順（音読みの50音順）。書式は grade1.json と同じ。`,
  kanji,
};
// 1字1行に近い読みやすい形で書き出す
const body = kanji
  .map((k) => {
    const ex = k.examples.map((e) => `      ${JSON.stringify(e)}`).join(",\n");
    return `    { "kanji": ${JSON.stringify(k.kanji)}, "on": ${JSON.stringify(k.on)}, "kun": ${JSON.stringify(k.kun)}, "examples": [\n${ex}\n    ] }`;
  })
  .join(",\n");
fs.writeFileSync(
  out,
  `{\n  "grade": ${doc.grade},\n  "reviewed": ${doc.reviewed},\n  "note": ${JSON.stringify(doc.note)},\n  "kanji": [\n${body}\n  ]\n}\n`,
);
console.log(`wrote ${out}: ${kanji.length}字・例 ${kanji.reduce((t, k) => t + k.examples.length, 0)}`);
