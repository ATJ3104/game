// ================================================================
// リザルト画面: 勝者のポートレート+勝利ポーズのリグ+メニュー
// 「もういちど」「キャラをえらびなおす」「タイトルへ」
// ================================================================

import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { drawRobot } from '../robot';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

const ITEMS: MenuRect[] = [0, 1, 2].map((i) => ({
  x: 580,
  y: 250 + i * 72,
  w: 330,
  h: 56,
}));
const LABELS = ['もういちど たたかう', 'キャラをえらびなおす', 'タイトルへもどる'];

export class ResultScene implements Scene {
  private cursor = 0;
  private frame = 0;

  enter(): void {
    this.cursor = 0;
    this.frame = 0;
  }

  update(g: GameCtx): void {
    this.frame++;
    const p0 = g.input.getPad(0);
    const p1 = g.input.getPad(1);
    if (p0.upP || p1.upP) {
      this.cursor = (this.cursor + 2) % 3;
      g.sfx.cursor();
    }
    if (p0.downP || p1.downP) {
      this.cursor = (this.cursor + 1) % 3;
      g.sfx.cursor();
    }
    for (const t of g.input.takeTaps()) {
      ITEMS.forEach((r, i) => {
        if (inRect(t.x, t.y, r)) {
          if (this.cursor === i) this.decide(g);
          else {
            this.cursor = i;
            g.sfx.cursor();
          }
        }
      });
    }
    if ((g.input.confirmPressed || p0.kickP || p1.kickP) && this.frame > 20) this.decide(g);
  }

  private decide(g: GameCtx): void {
    g.sfx.confirm();
    if (this.cursor === 0) g.goto('vs'); // 同じ組み合わせでもう1回
    else if (this.cursor === 1) g.goto('select');
    else g.goto('title');
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const winner = g.winnerSide === 0 ? g.p1 : g.p2;
    // 背景: 勝者のテーマカラーでかがやく
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#141420');
    grad.addColorStop(1, '#282436');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // 放射状の光
    ctx.save();
    ctx.translate(280, 260);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = winner.colors.accent;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6 + this.frame * 0.0004);
      ctx.fillRect(0, -14, 500, 28);
    }
    ctx.restore();

    outlineText(ctx, 'WINNER!', 280, 60, 48, '#ffd23c');

    // 勝者のポートレート
    const img = g.images.get(winner.portrait);
    if (img) ctx.drawImage(img, 100, 100, 255, 340);
    ctx.strokeStyle = winner.colors.accent;
    ctx.lineWidth = 5;
    ctx.strokeRect(100, 100, 255, 340);
    outlineText(ctx, winner.name, 227, 475, 36, winner.colors.accent);

    // 勝利ポーズのリグ(バンザイしてよろこぶ)
    ctx.save();
    ctx.translate(440, 440);
    ctx.scale(1.35, 1.35);
    drawRobot(ctx, winner, 'win', this.frame, 0, 1);
    ctx.restore();

    outlineText(ctx, 'つぎはどうする?', 745, 210, 24, '#fff');
    LABELS.forEach((label, i) => {
      drawMenuItem(ctx, ITEMS[i], label, this.cursor === i, this.frame);
    });
  }
}
