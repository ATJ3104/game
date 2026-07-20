// ================================================================
// ゲーム全体で共有する型と定数
// シーン(画面)は Scene インターフェースを実装し、GameCtx を通じて
// 入力・音・画像・画面遷移にアクセスする。
// ================================================================

import type { Input } from './input';
import type { Sfx } from './audio';
import type { RobotConfig } from './characters';
import type { NetSession } from './net';

// 内部解像度(この大きさで描いて、画面サイズに合わせて拡大縮小する)
export const VIEW_W = 960;
export const VIEW_H = 540;

export type SceneName = 'title' | 'howto' | 'online' | 'difficulty' | 'select' | 'vs' | 'battle' | 'result';

export interface Scene {
  /** シーンが表示されたときに1回呼ばれる */
  enter(g: GameCtx): void;
  /** 毎論理フレーム(60fps固定)呼ばれる */
  update(g: GameCtx): void;
  /** 毎描画フレーム呼ばれる */
  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void;
}

export interface GameCtx {
  input: Input;
  sfx: Sfx;
  images: Map<string, HTMLImageElement>; // 読み込み済みポートレート画像(パスがキー)
  isTouch: boolean; // タッチ端末かどうか
  mode: 'cpu' | 'vs' | 'online'; // 1人プレイ / 同じPCで2人 / オンライン対戦
  difficulty: 0 | 1 | 2; // CPUの強さ(よわい/ふつう/つよい)
  net: NetSession | null; // オンライン対戦の接続(オフラインならnull)
  p1: RobotConfig;
  p2: RobotConfig;
  winnerSide: 0 | 1; // 直前のバトルの勝者
  stageIndex: number;
  goto(name: SceneName): void;
}
