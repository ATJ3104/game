// アイコン PNG を scripts/icon.svg から作る（開発時に一度だけ実行。生成物はリポジトリに含める）
// 使い方: node scripts/make-icons.cjs   （Playwright と Chromium が必要）
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const svg = fs.readFileSync(path.join(__dirname, "icon.svg"), "utf8");
const out = path.join(__dirname, "..", "public", "icons");
fs.mkdirSync(out, { recursive: true });

const targets = [
  { file: "icon-192.png", size: 192, pad: 0 },
  { file: "icon-512.png", size: 512, pad: 0 },
  // maskable は安全領域（中央80%）に収まるよう縮小
  { file: "icon-maskable-512.png", size: 512, pad: 0.1 },
  { file: "apple-touch-icon.png", size: 180, pad: 0 },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const t of targets) {
    await page.setViewportSize({ width: t.size, height: t.size });
    const inner = Math.round(t.size * (1 - t.pad * 2));
    await page.setContent(
      `<html><body style="margin:0;background:#f59e0b;display:flex;align-items:center;justify-content:center;width:${t.size}px;height:${t.size}px">` +
        svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `) +
        "</body></html>",
    );
    await page.screenshot({ path: path.join(out, t.file) });
    console.log("wrote", t.file);
  }
  await browser.close();
})();
