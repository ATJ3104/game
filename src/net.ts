// ================================================================
// オンライン対戦(ネットワーク)モジュール
// PeerJS(WebRTC)で2人のブラウザを直接つなぐ。
// 「あいことば(4けたの数字)」で部屋を作り、同じ数字を入れた人と対戦する。
//
// 同期のしくみ: ロックステップ方式
//  - おたがいの入力(ボタンの状態)を毎フレーム送りあう
//  - 両方の入力がそろったフレームだけゲームを進める
//  - 少し先のフレームに入力を予約する(INPUT_DELAY)ことで、
//    通信の遅れがあってもスムーズに動く
// ================================================================

import Peer, { type DataConnection } from 'peerjs';
import { emptyPad, type PadState } from './input';

/** 入力を何フレーム先に予約するか(大きいほど通信に強いが操作が遅れる) */
export const INPUT_DELAY = 4;

/** 部屋番号 → PeerJSのID(他のアプリとぶつからないように接頭辞をつける) */
export function roomPeerId(code: string): string {
  return `robo-fighter-atj-${code}`;
}

/** 4けたのあいことばを作る */
export function makeRoomCode(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

/**
 * PeerJSの接続先。ふつうは公式の無料クラウドを使う。
 * URLに ?peerhost=... を付けるとテスト用のローカルサーバーにつなげる。
 */
export function peerOptions(): { host: string; port: number; path: string; secure: boolean } | undefined {
  const q = new URLSearchParams(location.search);
  const host = q.get('peerhost');
  if (!host) return undefined;
  return {
    host,
    port: Number(q.get('peerport') ?? '9000'),
    path: q.get('peerpath') ?? '/',
    secure: q.get('peersecure') === '1',
  };
}

// ---- 入力のビット化(1フレームの入力を数字1つで送る) ----
const BITS = { left: 1, right: 2, up: 4, down: 8, punch: 16, kick: 32, special: 64 } as const;

export function encodePad(p: PadState): number {
  let b = 0;
  if (p.left) b |= BITS.left;
  if (p.right) b |= BITS.right;
  if (p.up) b |= BITS.up;
  if (p.down) b |= BITS.down;
  if (p.punch) b |= BITS.punch;
  if (p.kick) b |= BITS.kick;
  if (p.special) b |= BITS.special;
  return b;
}

/** ビット列からPadStateを復元する(prevは1フレーム前=押した瞬間の判定用) */
export function decodePad(bits: number, prev: number): PadState {
  const pad = emptyPad();
  pad.left = (bits & BITS.left) !== 0;
  pad.right = (bits & BITS.right) !== 0;
  pad.up = (bits & BITS.up) !== 0;
  pad.down = (bits & BITS.down) !== 0;
  pad.punch = (bits & BITS.punch) !== 0;
  pad.kick = (bits & BITS.kick) !== 0;
  pad.special = (bits & BITS.special) !== 0;
  pad.leftP = pad.left && (prev & BITS.left) === 0;
  pad.rightP = pad.right && (prev & BITS.right) === 0;
  pad.upP = pad.up && (prev & BITS.up) === 0;
  pad.downP = pad.down && (prev & BITS.down) === 0;
  pad.punchP = pad.punch && (prev & BITS.punch) === 0;
  pad.kickP = pad.kick && (prev & BITS.kick) === 0;
  pad.specialP = pad.special && (prev & BITS.special) === 0;
  return pad;
}

/** やりとりするメッセージの種類 */
export type NetMsg =
  | { t: 'i'; e: number; f: number; b: number } // 入力(e=何試合目か f=フレーム b=ビット)
  | { t: 'cursor'; i: number } // キャラ選択のカーソル位置
  | { t: 'pick'; id: string; stage: number } // キャラ決定
  | { t: 'rematch' } // もういちど
  | { t: 'reselect' } // キャラえらびなおし
  | { t: 'ping' } // 生きているよの合図(ハートビート)
  | { t: 'quit' }; // たいせん終了

/** これだけ音沙汰がなかったら切断あつかいにする(ミリ秒) */
const TIMEOUT_MS = 10000;

/** つながったあとの対戦セッション */
export class NetSession {
  /** 自分のがわ: 0=部屋を作った人(1P・左) 1=入った人(2P・右) */
  side: 0 | 1;
  closed = false;
  private peer: Peer;
  private conn: DataConnection;
  private ctrl: NetMsg[] = [];
  /** 相手の入力: "試合番号:フレーム" → ビット */
  private remoteInputs = new Map<string, number>();
  private localInputs = new Map<string, number>();
  epoch = 0; // いま何試合目か(再戦のたびに増える)
  lastScheduled = -1; // 自分の入力を何フレーム目まで予約したか
  private lastHeard = Date.now(); // さいごに相手から何か届いた時刻
  private pingTimer: ReturnType<typeof setInterval>;

  constructor(peer: Peer, conn: DataConnection, side: 0 | 1) {
    this.peer = peer;
    this.conn = conn;
    this.side = side;
    conn.on('data', (d) => {
      this.lastHeard = Date.now();
      const m = d as NetMsg;
      if (m.t === 'i') {
        this.remoteInputs.set(`${m.e}:${m.f}`, m.b);
      } else if (m.t !== 'ping') {
        this.ctrl.push(m);
      }
    });
    conn.on('close', () => {
      this.closed = true;
    });
    conn.on('error', () => {
      this.closed = true;
    });
    conn.on('iceStateChanged', (state) => {
      // 回線が完全に切れたときはすぐ気づく
      if (state === 'failed' || state === 'closed') this.closed = true;
    });
    peer.on('disconnected', () => {
      // シグナリングサーバーと切れてもP2P接続は続くので何もしない
    });
    peer.on('error', () => {
      this.closed = true;
    });
    // ハートビート: 2秒ごとに合図を送り、10秒返事がなければ切断あつかい
    this.pingTimer = setInterval(() => {
      if (this.closed) {
        clearInterval(this.pingTimer);
        return;
      }
      this.send({ t: 'ping' });
      if (Date.now() - this.lastHeard > TIMEOUT_MS) {
        this.closed = true;
        clearInterval(this.pingTimer);
      }
    }, 2000);
  }

  send(m: NetMsg): void {
    if (this.closed) return;
    try {
      this.conn.send(m);
    } catch {
      this.closed = true;
    }
  }

  /** 対戦(バトル)を1つ始める。入力バッファをリセットする */
  newBattle(): number {
    this.epoch++;
    this.lastScheduled = -1;
    return this.epoch;
  }

  /** 自分の入力をfフレーム目に予約して相手にも送る */
  scheduleLocal(f: number, bits: number): void {
    this.localInputs.set(`${this.epoch}:${f}`, bits);
    this.lastScheduled = f;
    this.send({ t: 'i', e: this.epoch, f, b: bits });
  }

  localInput(f: number): number | undefined {
    return this.localInputs.get(`${this.epoch}:${f}`);
  }

  remoteInput(f: number): number | undefined {
    return this.remoteInputs.get(`${this.epoch}:${f}`);
  }

  /** 入力いがいのメッセージを取り出す(取り出したら消える) */
  takeCtrl(): NetMsg[] {
    const q = this.ctrl;
    this.ctrl = [];
    return q;
  }

  close(): void {
    this.closed = true;
    clearInterval(this.pingTimer);
    try {
      this.conn.close();
    } catch {
      /* すでに閉じている */
    }
    try {
      this.peer.destroy();
    } catch {
      /* すでに閉じている */
    }
  }
}
