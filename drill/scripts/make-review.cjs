// 教材確認ページ（HTML）を content/ の JSON から作る。
// 使い方: node scripts/make-review.cjs <学年> [出力先.html]   （1年のときは、ひらがなの絵も載せる）
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..", "content");
const grade = Number(process.argv[2] || 1);
const g1 = JSON.parse(fs.readFileSync(path.join(root, `kanji/grade${grade}.json`), "utf8"));
const kana = JSON.parse(fs.readFileSync(path.join(root, "kana/words.json"), "utf8"));
const out = process.argv[3] || `review-grade${grade}.html`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function sentence(src) {
  return esc(src)
    .replace(/\{([^|{}]+)\|([^|{}]+)\}/g, (_, b, r) => `<ruby>${b}<rt>${r}</rt></ruby>`)
    .replace(/\[\[([^\]]+)\]\]/g, (_, t) => `<span class="target">${t}</span>`);
}

// レベルの区切り（src/domain/japanese/levels.ts と同じ計算）
const SIZES = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };
const partsOf = (g) => Math.round(SIZES[g] / 20);
let first = 10;
for (let g = 1; g < grade; g++) first += partsOf(g);
const parts = partsOf(grade);
const levels = Array.from({ length: parts }, (_, i) => `K${first + i}`);
const groups = levels.map((code, p) => ({
  code,
  items: g1.kanji.filter((_, i) => Math.floor((i * parts) / SIZES[grade]) === p),
}));
const total = g1.kanji.length;

const kanjiCards = groups
  .map(
    (grp) => `
<section class="level" id="${grp.code}">
  <h2><span class="code">${grp.code}</span> ${grade}年の漢字（${levels.indexOf(grp.code) + 1}/${parts}）<span class="chars">${grp.items.map((k) => k.kanji).join("")}</span></h2>
  <div class="cards">
  ${grp.items
    .map(
      (k) => `
  <article class="card" data-key="${esc(k.kanji)}">
    <header>
      <div class="glyph">${esc(k.kanji)}</div>
      <dl class="yomi">
        <div><dt>音</dt><dd>${k.on.map(esc).join("・") || "—"}</dd></div>
        <div><dt>訓</dt><dd>${k.kun.map((x) => esc(x).replace(/\.(.+)$/, "<span class=\"okuri\">$1</span>")).join("・") || "—"}</dd></div>
      </dl>
      <label class="check"><input type="checkbox" id="chk-${esc(k.kanji)}" data-key="${esc(k.kanji)}"> 確認した</label>
    </header>
    ${k.examples
      .map(
        (ex) => `
    <div class="ex">
      <p class="sentence">${sentence(ex.sentence)}</p>
      <div class="rows">
        <div class="row"><span class="lab">読み</span><span class="ok">${esc(ex.reading)}</span>${ex.readWrong.map((w) => `<span class="ng">${esc(w)}</span>`).join("")}</div>
        <div class="row"><span class="lab">漢字</span><span class="ok">${esc(ex.word)}</span>${ex.kanjiWrong.map((w) => `<span class="ng">${esc(w)}</span>`).join("")}</div>
      </div>
    </div>`,
      )
      .join("")}
  </article>`,
    )
    .join("")}
  </div>
</section>`,
  )
  .join("");

const kanaGrid = kana.words
  .map((w) => `<li><span class="k">${esc(w.kana)}</span><span class="e">${w.emoji}</span><span class="w">${esc(w.word)}</span></li>`)
  .join("");

const html = `<title>まいにちドリル ${grade}年の漢字の確認</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Klee+One:wght@600&family=BIZ+UDPGothic:wght@400;700&display=swap">
<style>
/* 教科書の紙面：生成りの紙・朱の正解・鉛筆の灰。漢字は教科書体（Klee One）、本文は UD ゴシック */
:root {
  --paper: #fbf8f1; --card: #ffffff; --ink: #24211c; --muted: #6d665a; --line: #e4dccb;
  --accent: #c2410c; --accent-soft: #fde8d8; --ng: #f1ede4; --ng-ink: #4f4a40; --done: #e7f2e4; --done-ink: #2f5d2a;
  --font-kanji: "Klee One", "Hiragino Mincho ProN", "Yu Mincho", serif;
  --font-body: "BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #1b1915; --card: #24211c; --ink: #f1ece2; --muted: #a9a092; --line: #3a352d;
  --accent: #fb923c; --accent-soft: #3a2416; --ng: #2e2a23; --ng-ink: #d8d0c2; --done: #1f3320; --done-ink: #a7d79f; color-scheme: dark } }
:root[data-theme="dark"] {
  --paper: #1b1915; --card: #24211c; --ink: #f1ece2; --muted: #a9a092; --line: #3a352d;
  --accent: #fb923c; --accent-soft: #3a2416; --ng: #2e2a23; --ng-ink: #d8d0c2; --done: #1f3320; --done-ink: #a7d79f; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--paper); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.7;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 24px 64px; }
.wrap { max-width: 1080px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px; }
h1 { font-family: var(--font-kanji); font-size: 30px; line-height: 1.3; margin: 0; text-wrap: balance; }
.lead { color: var(--muted); max-width: 65ch; margin: 8px 0 0; }
.howto { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 16px 20px; display: grid; gap: 6px; max-width: 760px; }
.howto b { color: var(--accent); }
.legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; color: var(--muted); }
.progress { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--paper); padding-block: 8px; border-bottom: 1px solid var(--line);
  display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 14px; }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--paper); }
.progress nav { display: flex; gap: 6px; flex-wrap: wrap; }
.progress a { color: var(--ink); text-decoration: none; border: 1px solid var(--line); border-radius: 999px; padding: 2px 10px; font-variant-numeric: tabular-nums; }
.progress a:focus-visible, .check input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.count { font-variant-numeric: tabular-nums; font-weight: 700; }
h2 { font-size: 18px; margin: 0 0 14px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.code { font-variant-numeric: tabular-nums; color: var(--accent); letter-spacing: 0.04em; }
.chars { font-family: var(--font-kanji); font-weight: 600; color: var(--muted); font-size: 16px; letter-spacing: 0.08em; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.card.done { background: var(--done); }
.card header { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: start; }
.glyph { font-family: var(--font-kanji); font-weight: 600; font-size: 52px; line-height: 1; width: 64px; height: 64px; display: grid; place-items: center;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 32px 32px; background-position: center; border: 1px solid var(--line); }
.yomi { margin: 0; display: grid; gap: 2px; font-size: 13px; min-width: 0; }
.yomi div { display: flex; gap: 6px; }
.yomi dt { color: var(--muted); flex: none; }
.yomi dd { margin: 0; overflow-wrap: anywhere; }
.okuri { color: var(--muted); }
.okuri::before { content: "-"; }
.check { font-size: 13px; display: flex; gap: 4px; align-items: center; white-space: nowrap; cursor: pointer; color: var(--muted); }
.card.done .check { color: var(--done-ink); font-weight: 700; }
.check input { width: 18px; height: 18px; accent-color: var(--accent); }
.ex { border-top: 1px dashed var(--line); padding-top: 10px; display: grid; gap: 6px; }
.sentence { margin: 0; font-size: 19px; line-height: 2.1; }
.sentence rt { font-size: 10px; color: var(--muted); }
.target { border-bottom: 3px solid var(--accent); color: var(--accent); font-weight: 700; padding: 0 1px; }
.rows { display: grid; gap: 4px; }
.row { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; font-size: 14px; }
.lab { color: var(--muted); font-size: 12px; width: 2.5em; flex: none; letter-spacing: 0.06em; }
.ok, .ng { border-radius: 4px; padding: 0 7px; }
.ok { background: var(--accent-soft); color: var(--accent); font-weight: 700; }
.ng { background: var(--ng); color: var(--ng-ink); }
.kana ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px; }
.kana li { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 8px; align-items: center; }
.kana .k { font-family: var(--font-kanji); font-weight: 600; font-size: 28px; grid-row: span 2; }
.kana .e { font-size: 24px; line-height: 1.1; }
.kana .w { font-size: 13px; color: var(--muted); }
.note { color: var(--muted); font-size: 13px; max-width: 65ch; margin: 0 0 12px; }
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>

<div class="wrap">
  <div>
    <h1>${grade === 1 ? "国語教材の確認（ひらがなの絵・1年の漢字）" : `国語教材の確認（${grade}年の漢字）`}</h1>
    <p class="lead">まいにちドリルの国語で出題する内容です。まだ「未確認」なので、確認が済むまで子どもには出題されません。例文では、そのレベルまでに習う漢字だけを使い、まだ習わない漢字はひらがなで書いています。漢字は${total}字、例文は${g1.kanji.reduce((t, k) => t + k.examples.length, 0)}文です。</p>
  </div>

  <div class="howto">
    <div>例文の<b>下線</b>が問題の部分です。読みの問題は下線の漢字を見て読みを選び、漢字の問題は読みを見て漢字を選びます。</div>
    <div class="legend"><span><span class="ok">朱</span> 正解</span><span><span class="ng">灰</span> まちがいの選択肢（3つ）</span><span>ふりがな付きの漢字は、子どもの設定に応じて表示を変えます</span></div>
    <div>見てほしい点：まちがいの選択肢がその文でも正解になってしまわないか、例文が自然か、${grade}年生に難しすぎないか。直してほしい箇所は、漢字と内容をチャットで教えてください。</div>
  </div>

  <div class="progress" aria-label="確認の進み具合">
    <span>確認した漢字 <span class="count" id="count">0</span> / ${total}</span>
    <nav>${levels.map((c) => `<a href="#${c}">${c}</a>`).join("")}${grade === 1 ? '<a href="#kana">かなの絵</a>' : ""}</nav>
  </div>

  ${kanjiCards}

  ${grade === 1 ? `<section class="kana" id="kana">
    <h2><span class="code">K01</span> ひらがなの絵（${kana.words.length}語）</h2>
    <p class="note">「もじを見て、その文字で始まるものを選ぶ」問題に使います。絵文字がその名前に見えるか、ほかの呼び方をしないかを見てください。を・ん・せ・の・ま・る などは、よい絵がないので使っていません（聞き取りの問題では出ます）。</p>
    <ul>${kanaGrid}</ul>
  </section>` : ""}
</div>

<script>
(function () {
  var KEY = "drill-review-g${grade}";
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
  var boxes = document.querySelectorAll(".check input");
  function update() {
    var n = 0;
    boxes.forEach(function (b) {
      var card = b.closest(".card");
      card.classList.toggle("done", b.checked);
      if (b.checked) n++;
    });
    document.getElementById("count").textContent = n;
  }
  boxes.forEach(function (b) {
    b.checked = !!saved[b.dataset.key];
    b.addEventListener("change", function () {
      saved[b.dataset.key] = b.checked;
      try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {}
      update();
    });
  });
  update();
})();
</script>
`;
fs.writeFileSync(out, html);
console.log("wrote", out, html.length);
