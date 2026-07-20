// ================================================================
// タイトル画面
// ロゴ(テキスト装飾)+「ひとりで/ふたりで」のモード選択。
// スマホでは2P対戦は「PCでプレイしてね」表示にする。
// ================================================================

import { GAME_TITLE, CHARACTERS } from '../characters';
import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { drawRobot } from '../robot';
import { loadSave } from '../storage';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

const ITEMS: MenuRect[] = [0, 1, 2, 3, 4].map((i) => ({
  x: VIEW_W / 2 - 190,
  y: 252 + i * 56,
  w: 380,
  h: 46,
}));

export class TitleScene implements Scene {
  private cursor = 0;
  private frame = 0;
  private tutorialDone = false;

  enter(): void {
    this.cursor = 0;
    this.tutorialDone = !!loadSave().tutorialDone;
  }

  update(g: GameCtx): void {
    this.frame++;
    const p0 = g.input.getPad(0);
    const p1 = g.input.getPad(1);
    if (p0.upP || p1.upP) {
      this.cursor = (this.cursor + ITEMS.length - 1) % ITEMS.length;
      g.sfx.cursor();
    }
    if (p0.downP || p1.downP) {
      this.cursor = (this.cursor + 1) % ITEMS.length;
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
    if (i === 1 && g.isTouch) return; // スマホでは同じPCの2P対戦は選べない
    g.sfx.confirm();
    if (i === 0) {
      g.mode = 'cpu';
      g.goto('difficulty');
    } else if (i === 1) {
      g.mode = 'vs';
      g.goto('select');
    } else if (i === 2) {
      g.mode = 'online';
      g.goto('online'); // オンライン対戦ロビーへ
    } else if (i === 3) {
      g.mode = 'cpu';
      g.goto('tutorial'); // チュートリアル(れんしゅう)
    } else {
      g.goto('howto'); // そうさせつめい
    }
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
    const ty = 140 + Math.sin(this.frame * 0.04) * 4;
    outlineText(ctx, GAME_TITLE, VIEW_W / 2 + 5, ty + 6, 84, '#7a2020');
    outlineText(ctx, GAME_TITLE, VIEW_W / 2, ty, 84, '#ffd23c');
    outlineText(ctx, '— ブロックロボ かくとうゲーム —', VIEW_W / 2, ty + 70, 20, '#cfcfe8');

    drawMenuItem(ctx, ITEMS[0], 'ひとりであそぶ (VS CPU)', this.cursor === 0, this.frame);
    drawMenuItem(
      ctx, ITEMS[1],
      g.isTouch ? '同じPCの2Pたいせんは PCでプレイしてね' : 'ふたりであそぶ (同じPCで2P)',
      this.cursor === 1, this.frame, g.isTouch,
    );
    drawMenuItem(ctx, ITEMS[2], 'オンラインたいせん', this.cursor === 2, this.frame);
    drawMenuItem(ctx, ITEMS[3], 'チュートリアル (れんしゅう)', this.cursor === 3, this.frame);
    if (this.tutorialDone) {
      outlineText(ctx, '✅', ITEMS[3].x + ITEMS[3].w - 24, ITEMS[3].y + ITEMS[3].h / 2, 18, '#7fe97f');
    }
    drawMenuItem(ctx, ITEMS[4], 'そうさせつめい', this.cursor === 4, this.frame);

    outlineText(ctx, g.isTouch ? 'タップでえらんでね' : 'W/S↑↓:えらぶ  J/Enter:けってい', VIEW_W / 2, 530, 14, '#9f9fc0');
  }
}
