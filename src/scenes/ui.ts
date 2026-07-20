// ================================================================
// シーン共通の小さな描画ヘルパー(文字・ボタン・メニュー)
// ================================================================

export const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", Meiryo, sans-serif';

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
  outlineText(ctx, label, r.x + r.w / 2, r.y + r.h / 2, Math.min(26, r.h - 14), selected ? '#222' : '#fff');
  ctx.restore();
}
