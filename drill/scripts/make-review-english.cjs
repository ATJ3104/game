// 英語の教材確認ページ（HTML）を content/english/*.json から作る
// 使い方: node scripts/make-review-english.cjs [出力先.html]
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "content", "english");
const words = JSON.parse(fs.readFileSync(path.join(root, "words.json"), "utf8"));
const phrases = JSON.parse(fs.readFileSync(path.join(root, "phrases.json"), "utf8"));
const out = process.argv[2] || "review-english.html";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const nWords = words.levels.reduce((t, l) => t + l.words.length, 0);
const nPhrases = phrases.levels.reduce((t, l) => t + l.phrases.length, 0);

const wordSections = words.levels
  .map(
    (l) => `
<section class="level" id="${l.code}">
  <h2><span class="code">${l.code}</span> ${esc(l.theme)} <span class="count">${l.words.length}語</span></h2>
  <ul class="words">${l.words
    .map((w) => `<li><span class="emoji">${w.emoji}</span><span class="en">${esc(w.en)}</span><span class="ja">${esc(w.ja)}</span></li>`)
    .join("")}</ul>
</section>`,
  )
  .join("");

const phraseSections = phrases.levels
  .map(
    (l) => `
<section class="level" id="${l.code}">
  <h2><span class="code">${l.code}</span> ${esc(l.theme)} <span class="count">${l.phrases.length}文</span></h2>
  <ol class="phrases">${l.phrases.map((p) => `<li><span class="en">${esc(p.en)}</span><span class="ja">${esc(p.ja)}</span></li>`).join("")}</ol>
</section>`,
  )
  .join("");

const nav = [...words.levels, ...phrases.levels].map((l) => `<a href="#${l.code}">${l.code}</a>`).join("");

const html = `<title>まいにちドリル 英語教材の確認</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=BIZ+UDPGothic:wght@400;700&display=swap">
<style>
/* 英語のノート：方眼の白・インクの紺・赤ペンの注記。英語は読みやすい Atkinson Hyperlegible、日本語は UD ゴシック */
:root {
  --paper: #f7f8fb; --card: #ffffff; --ink: #1d2433; --muted: #5f6b80; --line: #dfe3ec; --accent: #2747a8; --accent-soft: #e6ecfb;
  --font-en: "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif;
  --font-ja: "BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #141822; --card: #1c2230; --ink: #e9edf6; --muted: #a2adc2; --line: #2d3547; --accent: #8fa8ff; --accent-soft: #232e4a; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #141822; --card: #1c2230; --ink: #e9edf6; --muted: #a2adc2; --line: #2d3547; --accent: #8fa8ff; --accent-soft: #232e4a; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font-family: var(--font-ja); font-size: 15px; line-height: 1.6;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 64px; }
.wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 36px; }
h1 { font-size: 26px; margin: 0; text-wrap: balance; }
.lead { color: var(--muted); max-width: 65ch; margin: 8px 0 0; }
nav { display: flex; flex-wrap: wrap; gap: 6px; position: sticky; top: env(safe-area-inset-top, 0px); background: var(--paper); padding-block: 8px; border-bottom: 1px solid var(--line); z-index: 5; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--paper); }
nav a { color: var(--ink); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 1px 9px; font-family: var(--font-en); font-variant-numeric: tabular-nums; font-size: 13px; }
nav a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
h2 { font-size: 18px; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
h3 { font-size: 20px; margin: 0; }
.code { color: var(--accent); font-family: var(--font-en); letter-spacing: 0.04em; }
.count { color: var(--muted); font-size: 13px; font-weight: 400; }
.words { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 8px; }
.words li { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: grid; grid-template-columns: auto 1fr; column-gap: 8px; align-items: center; min-width: 0; }
.words .emoji { font-size: 26px; grid-row: span 2; }
.words .en { font-family: var(--font-en); font-weight: 700; font-size: 17px; overflow-wrap: anywhere; }
.words .ja { color: var(--muted); font-size: 13px; }
.phrases { margin: 0; padding-left: 1.6em; display: grid; gap: 6px; }
.phrases li { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 2px 14px; }
.phrases .en { font-family: var(--font-en); font-weight: 700; font-size: 17px; }
.phrases .ja { color: var(--muted); }
.note { background: var(--accent-soft); border-radius: 10px; padding: 12px 16px; max-width: 760px; }
</style>
<div class="wrap">
  <div>
    <h1>英語教材の確認（単語・フレーズ）</h1>
    <p class="lead">単語 ${nWords}語（${words.levels.length}レベル）、フレーズ ${nPhrases}文（${phrases.levels.length}レベル）。${words.reviewed && phrases.reviewed ? "確認済み" : "まだ未確認なので、確認が済むまで子どもには出題されません。"}</p>
  </div>
  <p class="note">同じレベルの中で、意味や絵文字がまぎらわしいものがないか（選択肢で区別できるか）、英語や意味が自然か、を見てください。直してほしい箇所は、レベルのコードと単語をチャットで教えてください。</p>
  <nav aria-label="レベル">${nav}</nav>
  <h3>単語</h3>
  ${wordSections}
  <h3>フレーズ</h3>
  ${phraseSections}
</div>
`;
fs.writeFileSync(out, html);
console.log("wrote", out, html.length);
