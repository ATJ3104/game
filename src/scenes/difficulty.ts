// ================================================================
// 難易度選択画面(CPU戦のみ): よわい / ふつう / つよい
// ================================================================

import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { LEVEL_NAMES } from '../ai';
import { loadSave, patchSave } from '../storage';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

const DESC = ['はじめてでも かてる!', 'ちょうどいい つよさ', 'かてたら すごい!'];

const ITEMS: MenuRect[] = [0, 1, 2].map((i) => ({
  x: VIEW_W / 2 - 160,
  y: 210 + i * 80,
  w: 320,
  h: 60,
}));

export class DifficultyScene implements Scene {
  private cursor = 1; // まんなか(NORMAL)から始める
  private frame = 0;

  enter(): void {
    // 前回えらんだ強さをおぼえている
    this.cursor = loadSave().difficulty ?? 1;
  }

  update(g: GameCtx): void {
    this.frame++;
    const p = g.input.getPad(0);
    const p1 = g.input.getPad(1); // 矢印キーでも操作できる
    if (p.upP || p1.upP) {
      this.cursor = (this.cursor + 2) % 3;
      g.sfx.cursor();
    }
    if (p.downP || p1.downP) {
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
    if (g.input.confirmPressed || p.kickP || p1.kickP) this.decide(g);
  }

  private decide(g: GameCtx): void {
    g.sfx.confirm();
    g.difficulty = this.cursor as 0 | 1 | 2;
    patchSave({ difficulty: g.difficulty }); // 次回のために保存
    g.goto('select');
  }

  draw(_g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#101828');
    grad.addColorStop(1, '#243048');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    outlineText(ctx, 'CPUのつよさをえらんでね', VIEW_W / 2, 120, 42, '#ffd23c');
    LEVEL_NAMES.forEach((name, i) => {
      drawMenuItem(ctx, ITEMS[i], name, this.cursor === i, this.frame);
    });
    outlineText(ctx, DESC[this.cursor], VIEW_W / 2, 490, 22, '#cfe8ff');
  }
}
