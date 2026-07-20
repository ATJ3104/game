// ================================================================
// VS画面: 両者のポートレートを左右に対面配置して2秒だけ見せる
// ================================================================

import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { STAGE_NAMES } from '../stage';
import { outlineText } from './ui';

const DURATION = 120; // 2秒(60fps)

export class VsScene implements Scene {
  private t = 0;

  enter(): void {
    this.t = 0;
  }

  update(g: GameCtx): void {
    this.t++;
    g.input.takeTaps(); // タップはためない
    if (this.t >= DURATION) g.goto('battle');
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#0c0c16';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // ななめの分割ライン
    ctx.fillStyle = '#1c1c30';
    ctx.beginPath();
    ctx.moveTo(VIEW_W / 2 + 80, 0);
    ctx.lineTo(VIEW_W, 0);
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.lineTo(VIEW_W / 2 - 80, VIEW_H);
    ctx.fill();

    // ポートレートが左右からスライドイン
    const slide = Math.min(1, this.t / 25);
    const ease = 1 - (1 - slide) * (1 - slide);
    const pw = 300;
    const ph = 400;
    const p1x = -pw + ease * (pw + 60);
    const p2x = VIEW_W - ease * (pw + 60);

    const img1 = g.images.get(g.p1.portrait);
    const img2 = g.images.get(g.p2.portrait);
    if (img1) ctx.drawImage(img1, p1x, 70, pw, ph);
    ctx.strokeStyle = g.p1.colors.accent;
    ctx.lineWidth = 5;
    ctx.strokeRect(p1x, 70, pw, ph);
    if (img2) {
      // 2P側は左右反転して「向かい合っている」ようにする
      ctx.save();
      ctx.translate(p2x + pw / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img2, -pw / 2, 70, pw, ph);
      ctx.restore();
    }
    ctx.strokeStyle = g.p2.colors.accent;
    ctx.strokeRect(p2x, 70, pw, ph);

    outlineText(ctx, g.p1.name, p1x + pw / 2, 46, 30, g.p1.colors.accent);
    outlineText(ctx, g.p2.name, p2x + pw / 2, 46, 30, g.p2.colors.accent);

    // VSロゴ(ドンとひろがる)
    if (this.t > 20) {
      const vs = Math.min(1, (this.t - 20) / 12);
      const size = 130 * (2 - vs);
      ctx.globalAlpha = vs;
      outlineText(ctx, 'VS', VIEW_W / 2, VIEW_H / 2, size, '#ffd23c');
      ctx.globalAlpha = 1;
    }
    outlineText(ctx, `ステージ: ${STAGE_NAMES[g.stageIndex % STAGE_NAMES.length]}`, VIEW_W / 2, 505, 18, '#9f9fc0');
  }
}
