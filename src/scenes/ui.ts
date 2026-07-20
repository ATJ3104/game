// ================================================================
// シーン共通の小さな描画ヘルパー(文字・ボタン・メニュー)
// ================================================================

export const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';

/** OSの「視差効果を減らす」設定(画面ゆれ・強い点滅をひかえる) */
export const REDUCED_MOTION: boolean =
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 角丸四角のパス(古いブラウザにroundRectが無くても動くように自前で描く) */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * キーキャップ(キーボードのキーの見た目)を描く。
 * 幅はラベルに合わせて自動。描いた幅を返す。
 */
export function drawKeycap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  size = 15,
): number {
  ctx.font = `bold ${size}px ${FONT}`;
  const padX = 8;
  const w = Math.max(size + padX * 2 - 6, ctx.measureText(label).width + padX * 2);
  const h = size + 12;
  // 下の影(キーの厚み)
  ctx.fillStyle = '#20283f';
  roundRectPath(ctx, x, y - h / 2 + 3, w, h, 5);
  ctx.fill();
  // キー上面
  const grad = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  grad.addColorStop(0, '#4a5878');
  grad.addColorStop(1, '#333e5c');
  ctx.fillStyle = grad;
  roundRectPath(ctx, x, y - h / 2 - 1, w, h, 5);
  ctx.fill();
  ctx.strokeStyle = '#5c6c94';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // ラベル
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y - 1);
  return w;
}

/** キーキャップの列を描く(「A / D」のように区切りテキストつき)。合計幅を返す */
export function drawKeycaps(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  keys: string[],
  size = 15,
  sep = ' ',
): number {
  let cx = x;
  keys.forEach((k, i) => {
    if (i > 0) {
      ctx.font = `bold ${size - 2}px ${FONT}`;
      ctx.fillStyle = '#9f9fc0';
      ctx.textAlign = 'center';
      ctx.fillText(sep, cx + 7, y);
      cx += 14;
    }
    cx += drawKeycap(ctx, cx, y, k, size) + 2;
  });
  return cx - x;
}

/** ふちどり付きの文字(ゲームっぽい見た目にする) */
export function outlineText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  align: CanvasTextAlign = 'center',
  outline = '#15151c',
): void {
  ctx.font = `bold ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size / 8);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function inRect(px: number, py: number, r: MenuRect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

/** メニューの1項目を描く */
export function drawMenuItem(
  ctx: CanvasRenderingContext2D,
  r: MenuRect,
  label: string,
  selected: boolean,
  frame: number,
  disabled = false,
): void {
  ctx.save();
  ctx.globalAlpha = disabled ? 0.4 : 1;
  ctx.fillStyle = selected ? 'rgba(255,210,60,0.92)' : 'rgba(20,20,36,0.82)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = selected ? '#fff' : '#555';
  ctx.lineWidth = 3;
  ctx.strokeRect(r.x, r.y, r.w, r.h);
  if (selected) {
    // 選択中はカーソル(▶)が横でゆれる
    const wob = Math.sin(frame * 0.15) * 4;
    outlineText(ctx, '▶', r.x - 22 + wob, r.y + r.h / 2, 24, '#ffd23c');
  }
  // 文字がわくからはみ出さないように、長い文字は自動で小さくする
  let size = Math.min(26, r.h - 14);
  ctx.font = `bold ${size}px ${FONT}`;
  const tw = ctx.measureText(label).width;
  const maxW = r.w - 28;
  if (tw > maxW) size = Math.max(11, Math.floor((size * maxW) / tw));
  outlineText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, size, selected ? '#222' : '#fff');
  ctx.restore();
}
