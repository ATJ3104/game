// ================================================================
// キャラクター選択画面(SF2風)
// 8体を2x4グリッドでサムネイル表示。選択中のキャラは右側に
// ポートレート画像+名前・タイプ・必殺技名を大きく表示する。
// 2P対戦のときは 1P→2P の順にえらぶ。
// ================================================================

import { CHARACTERS } from '../characters';
import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { STAGE_NAMES } from '../stage';
import { inRect, outlineText, type MenuRect } from './ui';

// グリッドの配置(4列x2行)
const COLS = 4;
const THUMB_W = 108;
const THUMB_H = 144;
const GAP = 14;
const GRID_X = 56;
const GRID_Y = 128;

function thumbRect(i: number): MenuRect {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return {
    x: GRID_X + col * (THUMB_W + GAP),
    y: GRID_Y + row * (THUMB_H + GAP),
    w: THUMB_W,
    h: THUMB_H,
  };
}

const OK_BTN: MenuRect = { x: 620, y: 468, w: 280, h: 54 };

export class SelectScene implements Scene {
  private cursor = 0;
  private phase: 0 | 1 = 0; // 0=1Pがえらび中 1=2Pがえらび中
  private frame = 0;

  enter(g: GameCtx): void {
    this.cursor = 0;
    this.phase = 0;
    g.stageIndex = Math.floor(Math.random() * STAGE_NAMES.length); // ステージはランダム
  }

  private moveCursor(g: GameCtx, dx: number, dy: number): void {
    let col = this.cursor % COLS;
    let row = Math.floor(this.cursor / COLS);
    col = (col + dx + COLS) % COLS;
    row = (row + dy + 2) % 2;
    this.cursor = row * COLS + col;
    g.sfx.cursor();
  }

  update(g: GameCtx): void {
    this.frame++;
    // えらぶ人のパッド(1Pのあとは2P)
    const pad = g.input.getPad(this.phase === 0 ? 0 : 1);
    if (pad.leftP) this.moveCursor(g, -1, 0);
    if (pad.rightP) this.moveCursor(g, 1, 0);
    if (pad.upP) this.moveCursor(g, 0, -1);
    if (pad.downP) this.moveCursor(g, 0, 1);

    let decide = pad.punchP || pad.kickP || g.input.confirmPressed;
    for (const t of g.input.takeTaps()) {
      CHARACTERS.forEach((_, i) => {
        if (inRect(t.x, t.y, thumbRect(i))) {
          if (this.cursor === i) decide = true;
          else {
            this.cursor = i;
            g.sfx.cursor();
          }
        }
      });
      if (inRect(t.x, t.y, OK_BTN)) decide = true;
    }

    if (decide) {
      g.sfx.confirm();
      if (this.phase === 0) {
        g.p1 = CHARACTERS[this.cursor];
        if (g.mode === 'vs') {
          this.phase = 1; // 次は2Pの番
          this.cursor = (this.cursor + 4) % 8;
        } else {
          // CPUの相手はランダムにきまる
          g.p2 = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
          g.goto('vs');
        }
      } else {
        g.p2 = CHARACTERS[this.cursor];
        g.goto('vs');
      }
    }
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#181828');
    grad.addColorStop(1, '#2c2440');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    outlineText(ctx, 'キャラクターをえらんでね', VIEW_W / 2, 52, 34, '#ffd23c');
    const who = this.phase === 0 ? (g.mode === 'vs' ? '1Pのばん!' : 'すきなキャラをえらぼう') : '2Pのばん!';
    outlineText(ctx, who, VIEW_W / 2, 92, 20, this.phase === 0 ? '#8fd0ff' : '#ff9db0');

    const sel = CHARACTERS[this.cursor];

    // --- サムネイルグリッド ---
    CHARACTERS.forEach((c, i) => {
      const r = thumbRect(i);
      const img = g.images.get(c.thumb);
      ctx.fillStyle = '#101018';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (img) ctx.drawImage(img, r.x, r.y, r.w, r.h);
      // わく(選択中は光る)
      const isSel = i === this.cursor;
      ctx.lineWidth = isSel ? 5 : 2;
      ctx.strokeStyle = isSel
        ? (this.phase === 0 ? '#8fd0ff' : '#ff9db0')
        : '#44445c';
      if (isSel) {
        ctx.save();
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 10 + Math.sin(this.frame * 0.2) * 5;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.restore();
      } else {
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
      // 1Pがえらんだキャラに印をつける(2P選択中)
      if (this.phase === 1 && g.p1 === c) {
        outlineText(ctx, '1P', r.x + 18, r.y + 14, 16, '#8fd0ff');
      }
    });

    // --- 右側: 選択中キャラのポートレートと情報 ---
    const px = 566;
    const pw = 200;
    const phh = 267;
    const infoX = px + pw + 18; // 情報テキストの左はし(画面内におさめる)
    const portrait = g.images.get(sel.portrait);
    ctx.fillStyle = '#101018';
    ctx.fillRect(px, 118, pw, phh);
    if (portrait) ctx.drawImage(portrait, px, 118, pw, phh);
    ctx.strokeStyle = sel.colors.accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(px, 118, pw, phh);

    outlineText(ctx, sel.name, px + pw / 2, 100, 32, sel.colors.accent);
    outlineText(ctx, `タイプ: ${sel.typeLabel}`, infoX, 140, 19, '#fff', 'left');
    outlineText(ctx, 'ひっさつわざ', infoX, 180, 15, '#9f9fc0', 'left');
    outlineText(ctx, sel.special.name, infoX, 208, 18, sel.special.color, 'left');
    // かんたんなつよさ表示
    const stats = sel.stats;
    const bars: [string, number][] = [
      ['たいりょく', (stats.hp - 880) / 240],
      ['スピード', (stats.walkSpeed - 0.8) / 0.5],
      ['こうげき', (stats.attackPower - 0.88) / 0.3],
    ];
    bars.forEach(([label, v], i) => {
      const by = 252 + i * 46;
      outlineText(ctx, label, infoX, by, 15, '#cfcfe8', 'left');
      ctx.fillStyle = '#22222f';
      ctx.fillRect(infoX, by + 10, 120, 10);
      ctx.fillStyle = sel.colors.accent;
      ctx.fillRect(infoX, by + 10, 120 * Math.max(0.15, Math.min(1, v)), 10);
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.strokeRect(infoX, by + 10, 120, 10);
    });
    outlineText(ctx, `HP ${stats.hp}`, infoX, 408, 15, '#9f9fc0', 'left');

    // けっていボタン(タッチ用)
    ctx.fillStyle = 'rgba(255,210,60,0.9)';
    ctx.fillRect(OK_BTN.x, OK_BTN.y, OK_BTN.w, OK_BTN.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(OK_BTN.x, OK_BTN.y, OK_BTN.w, OK_BTN.h);
    outlineText(ctx, 'これにけってい!', OK_BTN.x + OK_BTN.w / 2, OK_BTN.y + OK_BTN.h / 2, 24, '#222');

    outlineText(
      ctx,
      g.isTouch ? 'タップでえらんで「けってい」!' : '移動キー:えらぶ  こうげきキー:けってい',
      GRID_X + (THUMB_W * 4 + GAP * 3) / 2, 486, 15, '#9f9fc0',
    );
  }
}
