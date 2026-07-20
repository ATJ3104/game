// ================================================================
// エントリーポイント
// - 60fps固定タイムステップのゲームループ(可変フレームでも
//   ゲームロジックの結果が変わらないようにする)
// - キャンバスの画面フィット(内部解像度960x540は固定)
// - ポートレート画像のプリロード
// - シーン(画面)の切りかえ
// ================================================================

import { CHARACTERS, GAME_TITLE } from './characters';
import { Input } from './input';
import { Sfx } from './audio';
import { TITLE_LOGO_SRC, VIEW_W, VIEW_H, type GameCtx, type Scene, type SceneName } from './game';
import { TitleScene } from './scenes/title';
import { HowToScene } from './scenes/howto';
import { TutorialScene } from './scenes/tutorial';
import { OnlineScene } from './scenes/online';
import { loadSave } from './storage';
import { DifficultyScene } from './scenes/difficulty';
import { SelectScene } from './scenes/select';
import { VsScene } from './scenes/vs';
import { BattleScene } from './scenes/battle';
import { ResultScene } from './scenes/result';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
document.title = GAME_TITLE;

// ---- タッチ端末かどうか ----
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---- キャンバスを画面サイズに合わせて拡大縮小(中身は960x540のまま) ----
function fitCanvas(): void {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
// スマホでURLバーが出入りしたときにも合わせなおす
window.visualViewport?.addEventListener('resize', fitCanvas);
fitCanvas();

// スマホたて持ちのときは「よこもちにしてね」を出す
const rotateEl = document.getElementById('rotate')!;
function checkOrientation(): void {
  const portrait = window.innerHeight > window.innerWidth;
  rotateEl.style.display = isTouch && portrait ? 'flex' : 'none';
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);
checkOrientation();

// ---- 画面上の座標 → ゲーム内部の座標に変換 ----
// pageX/pageY(ドキュメント基準)で計算する。clientX基準だとスマホの
// ピンチズームやゴムひもスクロールで視覚ビューポートがずれたときに
// タップ位置がずれてしまうため。
function toInternal(px: number, py: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const left = rect.left + window.scrollX;
  const top = rect.top + window.scrollY;
  return {
    x: ((px - left) / rect.width) * VIEW_W,
    y: ((py - top) / rect.height) * VIEW_H,
  };
}

const input = new Input(canvas, toInternal);
const sfx = new Sfx();

// スマホの自動再生制限対策: 最初のユーザー操作で音をONにする
const unlock = (): void => sfx.unlock();
window.addEventListener('keydown', unlock);
window.addEventListener('pointerdown', unlock);
window.addEventListener('touchstart', unlock);

// ---- シーンの登録 ----
const scenes: Record<SceneName, Scene> = {
  title: new TitleScene(),
  howto: new HowToScene(),
  tutorial: new TutorialScene(),
  online: new OnlineScene(),
  difficulty: new DifficultyScene(),
  select: new SelectScene(),
  vs: new VsScene(),
  battle: new BattleScene(),
  result: new ResultScene(),
};

let currentScene: Scene = scenes.title;
let currentSceneName: SceneName = 'title';

// デバッグ用: ブラウザの開発者コンソールから状態をのぞけるようにする
// (例: robotFighterDebug.game.p1.name)
const debugHandle: Record<string, unknown> = {};
(window as unknown as Record<string, unknown>).robotFighterDebug = debugHandle;

const game: GameCtx = {
  input,
  sfx,
  images: new Map(),
  isTouch,
  mode: 'cpu',
  difficulty: loadSave().difficulty ?? 1, // 前回えらんだ強さをおぼえている
  net: null,
  p1: CHARACTERS[0],
  p2: CHARACTERS[1],
  winnerSide: 0,
  stageIndex: 0,
  goto(name: SceneName): void {
    currentScene = scenes[name];
    currentSceneName = name;
    debugHandle.sceneName = name;
    currentScene.enter(game);
  },
};
debugHandle.game = game;
debugHandle.scenes = scenes;
debugHandle.sceneName = currentSceneName;

// ---- ポートレート画像のプリロード ----
function loadImage(src: string): Promise<[string, HTMLImageElement]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve([src, img]);
    img.onerror = () => reject(new Error(`画像が読めません: ${src}`));
    img.src = src;
  });
}

async function loadAssets(): Promise<void> {
  const paths = [...CHARACTERS.flatMap((c) => [c.portrait, c.thumb]), TITLE_LOGO_SRC];
  const results = await Promise.all(paths.map(loadImage));
  for (const [src, img] of results) game.images.set(src, img);
}

// ---- 60fps固定タイムステップのゲームループ ----
const STEP = 1000 / 60;
let acc = 0;
let last = performance.now();

function loop(now: number): void {
  // タブが裏にいた等で時間が飛んでも、最大5ステップまでしか進めない
  acc += Math.min(120, now - last);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    input.step();
    currentScene.update(game);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  currentScene.draw(game, ctx);
  requestAnimationFrame(loop);
}

// ---- 起動: ロード画面 → タイトル ----
function drawLoading(text: string): void {
  ctx.fillStyle = '#0b0b14';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, VIEW_W / 2, VIEW_H / 2);
}

drawLoading('よみこみちゅう...');
loadAssets()
  .then(() => {
    game.goto('title');
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(loop);
    });
  })
  .catch((e: Error) => {
    drawLoading(`エラー: ${e.message}`);
  });
