// ================================================================
// そうさせつめい画面
// キーボード操作(1P/2P)・ガード・必殺技の出し方・スマホ操作を
// 1画面にまとめて表示する。
// ================================================================

import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { CHARACTERS } from '../characters';
import { drawRobot } from '../robot';
import { FONT, outlineText } from './ui';

export class HowToScene implements Scene {
  private frame = 0;

  enter(): void {
    this.frame = 0;
  }

  update(g: GameCtx): void {
    this.frame++;
    const p0 = g.input.getPad(0);
    const p1 = g.input.getPad(1);
    const back =
      g.input.confirmPressed || p0.punchP || p0.kickP || p1.punchP || p1.kickP ||
      g.input.takeTaps().length > 0;
    if (back && this.frame > 15) {
      g.sfx.cancel();
      g.goto('title');
    }
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#101828');
    grad.addColorStop(1, '#243048');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    outlineText(ctx, 'そうさせつめい', VIEW_W / 2, 42, 34, '#ffd23c');

    // ---- 左パネル: キーボード操作表 ----
    const lx = 40;
    ctx.fillStyle = 'rgba(10,12,24,0.75)';
    ctx.fillRect(lx, 74, 400, 330);
    ctx.strokeStyle = '#4a5a80';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, 74, 400, 330);
    outlineText(ctx, '🎮 キーボード', lx + 200, 100, 20, '#8fd0ff');

    const rows: [string, string, string][] = [
      ['', '1P', '2P'],
      ['いどう', 'A / D', '← / →'],
      ['ジャンプ', 'スペース', '↑'],
      ['しゃがみ', 'S', '↓'],
      ['パンチ(はやい)', 'J', '1'],
      ['キック(つよい)', 'K', '2'],
      ['ひっさつわざ', 'L', '3'],
    ];
    rows.forEach((r, i) => {
      const y = 136 + i * 38;
      const isHead = i === 0;
      const color = isHead ? '#9f9fc0' : '#ffffff';
      outlineText(ctx, r[0], lx + 20, y, 17, color, 'left');
      outlineText(ctx, r[1], lx + 235, y, isHead ? 15 : 18, isHead ? '#8fd0ff' : '#ffd23c');
      outlineText(ctx, r[2], lx + 340, y, isHead ? 15 : 18, isHead ? '#ff9db0' : '#ffd23c');
      if (!isHead) {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(lx + 14, y + 19);
        ctx.lineTo(lx + 386, y + 19);
        ctx.stroke();
      }
    });

    // ---- 右パネル: ガード・必殺技・スマホ ----
    const rx = 470;
    ctx.fillStyle = 'rgba(10,12,24,0.75)';
    ctx.fillRect(rx, 74, 450, 330);
    ctx.strokeStyle = '#4a5a80';
    ctx.strokeRect(rx, 74, 450, 330);

    outlineText(ctx, '🛡 ガード', rx + 20, 102, 19, '#8fd0ff', 'left');
    outlineText(ctx, 'あいてと はんたいの方向キーを おしっぱなしでガード!', rx + 24, 130, 15, '#fff', 'left');
    outlineText(ctx, '(しゃがみながらだと しゃがみガード)', rx + 24, 154, 14, '#9f9fc0', 'left');

    outlineText(ctx, '⚡ ひっさつわざの出しかた', rx + 20, 196, 19, '#ffd23c', 'left');
    outlineText(ctx, '① 画面下のゲージを まんタンにする', rx + 24, 224, 15, '#fff', 'left');
    outlineText(ctx, '   (時間がたつ・こうげきを当てると たまるよ)', rx + 24, 246, 14, '#9f9fc0', 'left');
    outlineText(ctx, '② ひっさつボタンを おす! (1P: L / 2P: 3)', rx + 24, 272, 15, '#fff', 'left');
    // ゲージのイメージ(たまっていく → 点滅)
    const gw = 260;
    const fill = (this.frame % 180) / 140;
    const full = fill >= 1;
    ctx.fillStyle = '#101020';
    ctx.fillRect(rx + 40, 292, gw, 14);
    ctx.fillStyle = full && this.frame % 20 < 10 ? '#fff' : '#ffd23c';
    ctx.fillRect(rx + 40, 292, gw * Math.min(1, fill), 14);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(rx + 40, 292, gw, 14);
    if (full) outlineText(ctx, 'ひっさつOK!', rx + 40 + gw + 60, 299, 14, '#ffd23c');

    outlineText(ctx, '📱 スマホ(よこもち)', rx + 20, 340, 19, '#8fd0ff', 'left');
    outlineText(ctx, '左の十字パッドで いどう、右の P / K / 必 ボタン', rx + 24, 368, 15, '#fff', 'left');
    outlineText(ctx, '(スマホは CPUせん・オンラインたいせんであそべるよ)', rx + 24, 390, 14, '#9f9fc0', 'left');

    // デモロボ(パンチしつづける)
    ctx.save();
    ctx.translate(880, 500);
    drawRobot(ctx, CHARACTERS[7], 'punch', this.frame, (this.frame % 40) / 40, -1);
    ctx.restore();

    // もどる案内(点滅)
    if (this.frame % 60 < 40) {
      ctx.font = `bold 18px ${FONT}`;
      outlineText(ctx, 'こうげきキー か タップで もどる', VIEW_W / 2, 470, 18, '#ffffff');
    }
    void g;
  }
}
