// ================================================================
// タイトル画面
// ロゴ(テキスト装飾)+「ひとりで/ふたりで」のモード選択。
// スマホでは2P対戦は「PCでプレイしてね」表示にする。
// ================================================================

import { GAME_TITLE, CHARACTERS } from '../characters';
import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { drawRobot } from '../robot';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

const ITEMS: MenuRect[] = [
  { x: VIEW_W / 2 - 190, y: 330, w: 380, h: 56 },
  { x: VIEW_W / 2 - 190, y: 402, w: 380, h: 56 },
];

export class TitleScene implements Scene {
  private cursor = 0;
  private frame = 0;

  enter(): void {
    this.cursor = 0;
  }

  update(g: GameCtx): void {
    this.frame++;
    const p0 = g.input.getPad(0);
    const p1 = g.input.getPad(1);
    const up = p0.upP || p1.upP;
    const down = p0.downP || p1.downP;
    if (up || down) {
      this.cursor = 1 - this.cursor;
      g.sfx.cursor();
    }
    // タップでの選択
    for (const t of g.input.takeTaps()) {
      ITEMS.forEach((r, i) => {
        if (inRect(t.x, t.y, r)) {
          if (this.cursor === i) this.decide(g, i);
          else {
            this.cursor = i;
            g.sfx.cursor();
          }
        }
      });
    }
    if (g.input.confirmPressed || p0.kickP || p1.kickP) this.decide(g, this.cursor);
  }

  private decide(g: GameCtx, i: number): void {
    if (i === 1 && g.isTouch) return; // スマホでは2P対戦は選べない
    g.sfx.confirm();
    g.mode = i === 0 ? 'cpu' : 'vs';
    g.goto(i === 0 ? 'difficulty' : 'select');
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    // 背景: 夜空グラデーション+ゆっくり動くブロック
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#141430');
    grad.addColorStop(1, '#30204a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    for (let i = 0; i < 14; i++) {
      const y = ((i * 97 + this.frame * 0.4) % (VIEW_H + 60)) - 30;
      ctx.fillStyle = `rgba(255,255,255,${0.04 + (i % 3) * 0.02})`;
      ctx.fillRect((i * 173) % VIEW_W, y, 26, 26);
    }

    // ロゴの後ろにキャラを2体かざる
    ctx.save();
    ctx.translate(180, 470);
    drawRobot(ctx, CHARACTERS[7], 'idle', this.frame, 0, 1);
    ctx.restore();
    ctx.save();
    ctx.translate(VIEW_W - 180, 470);
    drawRobot(ctx, CHARACTERS[1], 'idle', this.frame + 30, 0, -1);
    ctx.restore();

    // タイトルロゴ(重ね文字で立体風)
    const ty = 150 + Math.sin(this.frame * 0.04) * 4;
    outlineText(ctx, GAME_TITLE, VIEW_W / 2 + 5, ty + 6, 84, '#7a2020');
    outlineText(ctx, GAME_TITLE, VIEW_W / 2, ty, 84, '#ffd23c');
    outlineText(ctx, '— ブロックロボ かくとうゲーム —', VIEW_W / 2, ty + 70, 20, '#cfcfe8');

    drawMenuItem(ctx, ITEMS[0], 'ひとりであそぶ (VS CPU)', this.cursor === 0, this.frame);
    drawMenuItem(
      ctx, ITEMS[1],
      g.isTouch ? '2Pたいせんは PCでプレイしてね' : 'ふたりであそぶ (2Pたいせん)',
      this.cursor === 1, this.frame, g.isTouch,
    );

    outlineText(ctx, g.isTouch ? 'タップでえらんでね' : 'W/S↑↓:えらぶ  J/Enter:けってい', VIEW_W / 2, 505, 16, '#9f9fc0');
  }
}
