// ================================================================
// ステージ背景(ぜんぶコードで描く。画像は使わない)
// 空+地面+遠景シルエットのシンプルな構成を4種類。
// accent に選んだキャラのテーマカラーを渡すと、差し色が変わって
// 統一感が出るしくみ。
// ================================================================

import { VIEW_W, VIEW_H } from './game';

export const FLOOR_Y = 470; // 地面(足元)のy座標
export const STAGE_NAMES = ['ネオンシティ', 'サンセットやま', 'なぎさビーチ', 'うちゅうコロニー'];

function skyGrad(ctx: CanvasRenderingContext2D, top: string, bottom: string): void {
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW_W, FLOOR_Y);
}

/** 疑似乱数(毎フレーム同じ模様になるよう、座標から決める) */
function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function drawStage(ctx: CanvasRenderingContext2D, index: number, accent: string, frame: number): void {
  switch (index % 4) {
    case 0: { // ネオンシティ(夜の街)
      skyGrad(ctx, '#101024', '#2c2050');
      // 星
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const tw = hash(i + 99) * 6.28;
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(frame * 0.02 + tw));
        ctx.fillRect(hash(i) * VIEW_W, hash(i + 50) * 220, 2, 2);
      }
      ctx.globalAlpha = 1;
      // ビルのシルエット
      ctx.fillStyle = '#1a1430';
      for (let i = 0; i < 12; i++) {
        const w = 60 + hash(i + 7) * 60;
        const h = 90 + hash(i + 3) * 170;
        ctx.fillRect(i * 85 - 20, FLOOR_Y - h, w, h);
      }
      // ビルの窓あかり(アクセント色)
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < 40; i++) {
        ctx.fillRect(hash(i + 20) * VIEW_W, FLOOR_Y - 40 - hash(i + 60) * 160, 5, 7);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#26203a';
      ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
      break;
    }
    case 1: { // サンセットやま(夕焼けの山)
      skyGrad(ctx, '#3a2255', '#e8734a');
      // 太陽
      ctx.fillStyle = '#ffd98a';
      ctx.beginPath();
      ctx.arc(720, 300, 55, 0, Math.PI * 2);
      ctx.fill();
      // 山なみ(2重)
      ctx.fillStyle = '#4a2c4a';
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      for (let x = 0; x <= VIEW_W; x += 60) ctx.lineTo(x, FLOOR_Y - 120 - hash(x) * 110);
      ctx.lineTo(VIEW_W, FLOOR_Y);
      ctx.fill();
      ctx.fillStyle = '#332040';
      ctx.beginPath();
      ctx.moveTo(0, FLOOR_Y);
      for (let x = 0; x <= VIEW_W; x += 90) ctx.lineTo(x + 30, FLOOR_Y - 60 - hash(x + 5) * 70);
      ctx.lineTo(VIEW_W, FLOOR_Y);
      ctx.fill();
      ctx.fillStyle = '#2d2033';
      ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
      break;
    }
    case 2: { // なぎさビーチ(海)
      skyGrad(ctx, '#4aa8e8', '#bfe8ff');
      // くも
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 4; i++) {
        const cx = ((hash(i + 1) * VIEW_W + frame * 0.15) % (VIEW_W + 200)) - 100;
        const cy = 60 + hash(i + 9) * 120;
        ctx.fillRect(cx, cy, 90, 18);
        ctx.fillRect(cx + 18, cy - 12, 55, 14);
      }
      // 海と波
      ctx.fillStyle = '#2a7fc9';
      ctx.fillRect(0, 330, VIEW_W, FLOOR_Y - 330);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      for (let i = 0; i < 8; i++) {
        const wx = (hash(i + 30) * VIEW_W + Math.sin(frame * 0.03 + i) * 20) % VIEW_W;
        ctx.fillRect(wx, 345 + i * 14, 70, 3);
      }
      // すなはま
      ctx.fillStyle = '#e8d8a8';
      ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
      break;
    }
    default: { // うちゅうコロニー
      skyGrad(ctx, '#050510', '#141430');
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 70; i++) {
        ctx.globalAlpha = 0.3 + 0.6 * hash(i + 11);
        ctx.fillRect(hash(i) * VIEW_W, hash(i + 77) * FLOOR_Y, 2, 2);
      }
      ctx.globalAlpha = 1;
      // 惑星
      ctx.fillStyle = '#7a4a9e';
      ctx.beginPath();
      ctx.arc(200, 150, 65, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(185, 135, 45, 0, Math.PI * 2);
      ctx.fill();
      // 輪っか
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.ellipse(200, 155, 110, 25, -0.3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      // 金属の床
      ctx.fillStyle = '#202030';
      ctx.fillRect(0, FLOOR_Y, VIEW_W, VIEW_H - FLOOR_Y);
      ctx.fillStyle = '#303048';
      for (let x = 0; x < VIEW_W; x += 80) ctx.fillRect(x, FLOOR_Y, 40, VIEW_H - FLOOR_Y);
      break;
    }
  }
  // 床のアクセントライン(選択キャラのテーマカラー)
  ctx.fillStyle = accent;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(0, FLOOR_Y, VIEW_W, 4);
  ctx.globalAlpha = 1;
}
