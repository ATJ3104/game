// ================================================================
// 入力システム
// キーボード(1P/2P)と、スマホ用のタッチ仮想パッドをまとめて管理する。
// 毎フレーム step() を呼ぶと「押しっぱなし」と「今押した瞬間」を計算する。
// ================================================================

/** 1人分のコントローラーの状態 */
export interface PadState {
  // 押しっぱなし
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
  // このフレームに押した瞬間(エッジ)
  leftP: boolean;
  rightP: boolean;
  upP: boolean;
  downP: boolean;
  punchP: boolean;
  kickP: boolean;
  specialP: boolean;
}

export function emptyPad(): PadState {
  return {
    left: false, right: false, up: false, down: false,
    punch: false, kick: false, special: false,
    leftP: false, rightP: false, upP: false, downP: false,
    punchP: false, kickP: false, specialP: false,
  };
}

type PadKey = 'left' | 'right' | 'up' | 'down' | 'punch' | 'kick' | 'special';
const PAD_KEYS: PadKey[] = ['left', 'right', 'up', 'down', 'punch', 'kick', 'special'];

// キー割り当て
// 1P: A/D=移動 スペース=ジャンプ(Wでも可) S=しゃがみ J=パンチ K=キック L=必殺技
// 2P: ←→=移動 ↑=ジャンプ ↓=しゃがみ 1=パンチ 2=キック 3=必殺技
const KEYMAP: Record<PadKey, string[]>[] = [
  {
    left: ['KeyA'], right: ['KeyD'], up: ['Space', 'KeyW'], down: ['KeyS'],
    punch: ['KeyJ'], kick: ['KeyK'], special: ['KeyL'],
  },
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    punch: ['Digit1'], kick: ['Digit2'], special: ['Digit3'],
  },
];

// ゲームで使うキー(ブラウザのスクロール等を止める対象)
const GAME_KEYS = new Set<string>([
  ...Object.values(KEYMAP[0]).flat(),
  ...Object.values(KEYMAP[1]).flat(),
  'Space', 'Enter',
]);

// タッチ仮想パッドの配置(内部解像度960x540での座標)
// ボタンの当たり判定円が画面のはしからはみ出さない位置にする
// (はみ出すと、はしのタップがOSのジェスチャーにとられて反応しない)
const DPAD = { x: 118, y: 420, r: 78, dead: 16 };
const BTN_R = 44; // 半径44px → 画面上でじゅうぶん大きい(64px以上)
const BUTTONS: { key: PadKey; x: number; y: number; label: string }[] = [
  { key: 'punch', x: 742, y: 452, label: 'P' },
  { key: 'kick', x: 836, y: 402, label: 'K' },
  { key: 'special', x: 888, y: 474, label: '必' },
];

export class Input {
  private held = new Set<string>(); // 押されているキーコード
  private justDown = new Set<string>(); // 直前フレームに押された瞬間のキー(取りこぼし防止)
  private pads: PadState[] = [emptyPad(), emptyPad()];
  private prevHeld: boolean[][] = [PAD_KEYS.map(() => false), PAD_KEYS.map(() => false)];

  // タッチ関係
  private touches = new Map<number, { x: number; y: number }>();
  /** フローティング十字パッド: 左半分は「さわった場所」がスティックの中心になる */
  private sticks = new Map<number, { ox: number; oy: number }>();
  private touchJust: { x: number; y: number }[] = []; // 一瞬のタップも1フレームは押した扱いにする
  private tapQueue: { x: number; y: number }[] = [];
  /** バトル中だけ true にすると仮想パッドが反応・表示される */
  touchUIEnabled = false;
  /** 必殺ボタンを光らせるフラグ(ゲージ満タン時に battle がセット) */
  specialReady = false;

  // メニュー用: このフレームに「決定」が押されたか
  confirmPressed = false;
  private confirmQueued = false;
  // あいことば入力・ポーズ用: 押された数字キーなどの記録
  private typed: string[] = [];
  private blurredFlag = false; // ウィンドウからフォーカスが外れたか

  constructor(canvas: HTMLCanvasElement, private toInternal: (cx: number, cy: number) => { x: number; y: number }) {
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault(); // 矢印キー等でページが動かないように
      if (!e.repeat) {
        this.held.add(e.code);
        this.justDown.add(e.code); // すぐ離されても1フレームは「押した」ことにする
        if (e.code === 'Enter') this.confirmQueued = true; // スペースはジャンプ専用
        // あいことば入力用(数字・けす・もどる)
        if (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Escape') {
          this.typed.push(e.key);
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.blurredFlag = true; // バトル中なら自動ポーズに使う
    });

    // タッチ: passive:false + preventDefault でスクロール暴発を防ぐ(マルチタッチ対応)
    const opts: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const p = this.toInternal(t.pageX, t.pageY);
        this.touches.set(t.identifier, p);
        this.touchJust.push(p); // すぐ指をはなしても1フレームは反応させる
        this.tapQueue.push(p);
        // 左半分にさわったら、そこがスティックの基準点になる
        // (画面のずれや持ちかたに関係なく、指の動きだけで操作できる)
        if (this.touchUIEnabled && p.x < 460) {
          this.sticks.set(t.identifier, { ox: p.x, oy: p.y });
        }
      }
    }, opts);
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        const p = this.toInternal(t.pageX, t.pageY);
        this.touches.set(t.identifier, p);
      }
    }, opts);
    const end = (e: TouchEvent) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        this.touches.delete(t.identifier);
        this.sticks.delete(t.identifier);
      }
    };
    canvas.addEventListener('touchend', end, opts);
    canvas.addEventListener('touchcancel', end, opts);

    // マウスクリックもタップとして扱う(PCでのメニュー操作用)
    canvas.addEventListener('mousedown', (e) => {
      this.tapQueue.push(this.toInternal(e.pageX, e.pageY));
    });
  }

  /** 右半分のタッチを「いちばん近いボタン」に割り当てる(多少ずれてもOK) */
  private nearestButton(x: number, y: number): PadKey | null {
    let best: PadKey | null = null;
    let bd = 90; // これより遠いタッチはボタンあつかいしない
    for (const b of BUTTONS) {
      const d = Math.hypot(x - b.x, y - b.y);
      if (d < bd) {
        bd = d;
        best = b.key;
      }
    }
    return best;
  }

  /** 十字パッド1点分の方向判定(cx,cyが基準点) */
  private stickDir(out: Partial<Record<PadKey, boolean>>, x: number, y: number, cx: number, cy: number, dead: number): void {
    const dx = x - cx;
    const dy = y - cy;
    if (dx < -dead) out.left = true;
    if (dx > dead) out.right = true;
    if (dy < -dead * 1.3) out.up = true;
    if (dy > dead * 1.3) out.down = true;
  }

  /** タッチ仮想パッドから現在の入力を計算する(1P専用) */
  private touchPad(): Partial<Record<PadKey, boolean>> {
    const out: Partial<Record<PadKey, boolean>> = {};
    const just = this.touchJust;
    this.touchJust = []; // ジャストタッチは1フレームで使いきり
    if (!this.touchUIEnabled) return out;
    // 押しっぱなし中のタッチ
    for (const [id, { x, y }] of this.touches) {
      const stick = this.sticks.get(id);
      if (stick) {
        // フローティングスティック: さわった場所からの指の動きで方向をきめる
        this.stickDir(out, x, y, stick.ox, stick.oy, 12);
        // 見えている十字パッドの近くをさわった場合は、パッドの絵の位置でも判定
        // (矢印を直接おす操作もそのまま効く)
        if (Math.hypot(stick.ox - DPAD.x, stick.oy - DPAD.y) < DPAD.r * 1.4) {
          this.stickDir(out, x, y, DPAD.x, DPAD.y, DPAD.dead);
        }
      } else if (x >= 460) {
        const k = this.nearestButton(x, y);
        if (k) out[k] = true;
      }
    }
    // 一瞬のタップ(1フレームだけ反映)
    for (const { x, y } of just) {
      if (x < 460) {
        // タップは見えている十字パッドの近くだけ反応(はなれた場所の
        // タップで勝手に動かないように。ドラッグはどこでもOK)
        if (Math.hypot(x - DPAD.x, y - DPAD.y) < DPAD.r * 1.7) {
          this.stickDir(out, x, y, DPAD.x, DPAD.y, DPAD.dead);
        }
      } else {
        const k = this.nearestButton(x, y);
        if (k) out[k] = true;
      }
    }
    return out;
  }

  /** 毎論理フレーム呼ぶ。押した瞬間(エッジ)を計算する */
  step(): void {
    const touch = this.touchPad();
    for (let p = 0; p < 2; p++) {
      const pad = this.pads[p];
      PAD_KEYS.forEach((k, i) => {
        let heldNow = KEYMAP[p][k].some((code) => this.held.has(code) || this.justDown.has(code));
        if (p === 0 && touch[k]) heldNow = true; // タッチは1P扱い
        pad[k] = heldNow;
        (pad as unknown as Record<string, boolean>)[k + 'P'] = heldNow && !this.prevHeld[p][i];
        this.prevHeld[p][i] = heldNow;
      });
    }
    this.justDown.clear();
    this.confirmPressed =
      this.confirmQueued || this.pads[0].punchP || this.pads[1].punchP;
    this.confirmQueued = false;
    // どのシーンも読まなかったキー記録がたまり続けないように制限する
    if (this.typed.length > 8) this.typed = this.typed.slice(-8);
  }

  getPad(player: 0 | 1): PadState {
    return this.pads[player];
  }

  /** たまっているタップ位置を取り出す(取り出したら消える) */
  takeTaps(): { x: number; y: number }[] {
    const t = this.tapQueue;
    this.tapQueue = [];
    return t;
  }

  /** あいことば入力用: 押された数字キー等を取り出す */
  takeTyped(): string[] {
    const t = this.typed;
    this.typed = [];
    return t;
  }

  /** フォーカスが外れたかを1回だけ受け取る(自動ポーズ用) */
  consumeBlur(): boolean {
    const b = this.blurredFlag;
    this.blurredFlag = false;
    return b;
  }

  /** バトル画面用: タッチ仮想パッドを描画する */
  drawTouchUI(ctx: CanvasRenderingContext2D): void {
    if (!this.touchUIEnabled) return;
    ctx.save();
    ctx.globalAlpha = 0.4;
    // 十字パッド
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(DPAD.x, DPAD.y, DPAD.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    const a = 20;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀', DPAD.x - DPAD.r + a, DPAD.y);
    ctx.fillText('▶', DPAD.x + DPAD.r - a, DPAD.y);
    ctx.fillText('▲', DPAD.x, DPAD.y - DPAD.r + a);
    ctx.fillText('▼', DPAD.x, DPAD.y + DPAD.r - a);
    // ボタン
    const pad = this.pads[0];
    for (const b of BUTTONS) {
      const pressed = pad[b.key];
      const ready = b.key !== 'special' || this.specialReady;
      ctx.globalAlpha = pressed ? 0.75 : ready ? 0.45 : 0.2;
      ctx.fillStyle = b.key === 'special' ? '#ffcf3d' : b.key === 'kick' ? '#7fd0ff' : '#ff9d9d';
      ctx.beginPath();
      ctx.arc(b.x, b.y, BTN_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#111';
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(b.label, b.x, b.y + 1);
    }
    // いま認識しているタッチの位置を表示する
    // (スティックはさわった場所に出る。ずれの確認にもなる)
    for (const [id, t] of this.touches) {
      const stick = this.sticks.get(id);
      if (stick) {
        // フローティングスティックの台とノブ
        ctx.globalAlpha = 0.3;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(stick.ox, stick.oy, 44, 0, Math.PI * 2);
        ctx.stroke();
        const dx = t.x - stick.ox;
        const dy = t.y - stick.oy;
        const d = Math.hypot(dx, dy) || 1;
        const cl = Math.min(d, 44);
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(stick.ox + (dx / d) * cl, stick.oy + (dy / d) * cl, 18, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(t.x, t.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
