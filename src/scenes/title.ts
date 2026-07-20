// ================================================================
// タイトル画面
// ロゴ(テキスト装飾)+「ひとりで/ふたりで」のモード選択。
// スマホでは2P対戦は「PCでプレイしてね」表示にする。
// ================================================================

import { GAME_TITLE, CHARACTERS } from '../characters';
import { TITLE_LOGO_SRC, VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { drawRobot } from '../robot';
import { loadSave } from '../storage';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

/**
 * ロゴ画像のまわりを透明にフェードさせたキャンバスを作る
 * (背景となじませるため。ロゴ+サブタイトルの帯だけを切り出す)
 */
function buildLogoCache(img: HTMLImageElement): HTMLCanvasElement {
  const sw = img.width;
  const sy = Math.round(img.height * 0.13);
  const sh = Math.round(img.height * 0.72);
  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const cc = c.getContext('2d')!;
  cc.drawImage(img, 0, sy, sw, sh, 0, 0, sw, sh);
  // ふちをじょじょに透明にする(destination-outでアルファをけずる)
  cc.globalCompositeOperation = 'destination-out';
  const fx = sw * 0.07;
  const fy = sh * 0.14;
  const fade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number): void => {
    const gr = cc.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, 'rgba(0,0,0,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    cc.fillStyle = gr;
    cc.fillRect(rx, ry, rw, rh);
  };
  fade(0, 0, fx, 0, 0, 0, fx, sh); // 左
  fade(sw, 0, sw - fx, 0, sw - fx, 0, fx, sh); // 右
  fade(0, 0, 0, fy, 0, 0, sw, fy); // 上
  fade(0, sh, 0, sh - fy, 0, sh - fy, sw, fy); // 下
  return c;
}

const ITEMS: MenuRect[] = [0, 1, 2, 3, 4].map((i) => ({
  x: VIEW_W / 2 - 190,
  y: 346 + i * 37,
  w: 380,
  h: 33,
}));

export class TitleScene implements Scene {
  private cursor = 0;
  private frame = 0;
  private tutorialDone = false;
  private logoCache: HTMLCanvasElement | null = null;

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
    // 背景: 夜空グラデーション+ゆっくり動くブロック(ロゴ画像の濃紺になじむ色)
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#0b0e20');
    grad.addColorStop(1, '#241a3c');
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

    // タイトルロゴ(画像。サブタイトルも画像にふくまれる)
    const logo = g.images.get(TITLE_LOGO_SRC);
    if (logo) {
      if (!this.logoCache) this.logoCache = buildLogoCache(logo);
      const lw = 800;
      const lh = (this.logoCache.height * lw) / this.logoCache.width;
      const bob = Math.sin(this.frame * 0.04) * 3;
      ctx.drawImage(this.logoCache, (VIEW_W - lw) / 2, -6 + bob, lw, lh);
    } else {
      // 画像が読めなかったときのフォールバック(テキストロゴ)
      const ty = 140 + Math.sin(this.frame * 0.04) * 4;
      outlineText(ctx, GAME_TITLE, VIEW_W / 2 + 5, ty + 6, 84, '#7a2020');
      outlineText(ctx, GAME_TITLE, VIEW_W / 2, ty, 84, '#ffd23c');
      outlineText(ctx, '― 激突！ロボ格闘ゲーム ―', VIEW_W / 2, ty + 70, 20, '#cfcfe8');
    }

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

    outlineText(ctx, g.isTouch ? 'タップでえらんでね' : 'W/S↑↓:えらぶ  J/Enter:けってい', VIEW_W / 2, 536, 12, '#9f9fc0');
  }
}
