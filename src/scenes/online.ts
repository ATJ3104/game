// ================================================================
// オンライン対戦ロビー画面
// 「へやをつくる」→ 4けたのあいことばが表示される
// 「へやにはいる」→ あいことばを入力してつながる
// つながったら2人ともキャラ選択へ進む。
// ================================================================

import Peer from 'peerjs';
import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { NetSession, makeRoomCode, peerOptions, roomPeerId } from '../net';
import { drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

type Phase = 'menu' | 'hosting' | 'entering' | 'joining' | 'error';

const MENU: MenuRect[] = [
  { x: VIEW_W / 2 - 190, y: 210, w: 380, h: 56 },
  { x: VIEW_W / 2 - 190, y: 282, w: 380, h: 56 },
  { x: VIEW_W / 2 - 190, y: 354, w: 380, h: 56 },
];

// タッチ用の数字ボタン(0-9・けす・OK)
const NUMPAD: { label: string; x: number; y: number }[] = (() => {
  const out: { label: string; x: number; y: number }[] = [];
  const labels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'けす', '0', 'OK'];
  labels.forEach((label, i) => {
    out.push({ label, x: VIEW_W / 2 - 120 + (i % 3) * 120, y: 280 + Math.floor(i / 3) * 62 });
  });
  return out;
})();

export class OnlineScene implements Scene {
  private phase: Phase = 'menu';
  private cursor = 0;
  private frame = 0;
  private code = ''; // ホスト時: 自分の部屋番号 / 参加時: 入力中の番号
  private errorMsg = '';
  private peer: Peer | null = null;
  private starting = false;

  enter(g: GameCtx): void {
    this.phase = 'menu';
    this.cursor = 0;
    this.frame = 0;
    this.code = '';
    this.errorMsg = '';
    this.starting = false;
    this.cleanup();
    // 前のセッションが残っていたら閉じる
    if (g.net) {
      g.net.close();
      g.net = null;
    }
  }

  /** 途中でやめたときにPeerを片づける */
  private cleanup(): void {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {
        /* すでに閉じている */
      }
      this.peer = null;
    }
  }

  /** 部屋を作って相手を待つ */
  private startHosting(g: GameCtx, retry = 0): void {
    this.phase = 'hosting';
    this.code = makeRoomCode();
    const peer = new Peer(roomPeerId(this.code), peerOptions());
    this.peer = peer;
    peer.on('error', (err: Error & { type?: string }) => {
      if (this.peer !== peer) return;
      if (err.type === 'unavailable-id' && retry < 5) {
        // 同じ番号の部屋がすでにある → 別の番号でやりなおす
        peer.destroy();
        this.startHosting(g, retry + 1);
      } else {
        this.showError('つうしんエラーだよ。ネットの調子をみてね');
      }
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (this.peer !== peer || this.starting) return;
        this.starting = true;
        g.net = new NetSession(peer, conn, 0); // 部屋主は1P(左がわ)
        this.peer = null; // NetSessionが管理する
        g.sfx.confirm();
        g.goto('select');
      });
    });
  }

  /** あいことばで部屋に入る */
  private joinRoom(g: GameCtx): void {
    if (this.code.length !== 4) return;
    this.phase = 'joining';
    const opts = peerOptions();
    const peer = opts ? new Peer(opts) : new Peer();
    this.peer = peer;
    peer.on('error', (err: Error & { type?: string }) => {
      if (this.peer !== peer) return;
      if (err.type === 'peer-unavailable') {
        this.showError('へやが見つからないよ。あいことばをたしかめてね');
      } else {
        this.showError('つうしんエラーだよ。ネットの調子をみてね');
      }
    });
    peer.on('open', () => {
      if (this.peer !== peer) return;
      const conn = peer.connect(roomPeerId(this.code), { reliable: true });
      conn.on('open', () => {
        if (this.peer !== peer || this.starting) return;
        this.starting = true;
        g.net = new NetSession(peer, conn, 1); // 入った人は2P(右がわ)
        this.peer = null;
        g.sfx.confirm();
        g.goto('select');
      });
    });
  }

  private showError(msg: string): void {
    this.cleanup();
    this.errorMsg = msg;
    this.phase = 'error';
  }

  update(g: GameCtx): void {
    this.frame++;
    const p0 = g.input.getPad(0);
    const taps = g.input.takeTaps();
    const typed = g.input.takeTyped();

    if (this.phase === 'menu') {
      if (p0.upP) {
        this.cursor = (this.cursor + MENU.length - 1) % MENU.length;
        g.sfx.cursor();
      }
      if (p0.downP) {
        this.cursor = (this.cursor + 1) % MENU.length;
        g.sfx.cursor();
      }
      let decide = g.input.confirmPressed || p0.punchP || p0.kickP;
      for (const t of taps) {
        MENU.forEach((r, i) => {
          if (inRect(t.x, t.y, r)) {
            if (this.cursor === i) decide = true;
            else {
              this.cursor = i;
              g.sfx.cursor();
            }
          }
        });
      }
      if (decide) {
        g.sfx.confirm();
        if (this.cursor === 0) this.startHosting(g);
        else if (this.cursor === 1) {
          this.phase = 'entering';
          this.code = '';
        } else g.goto('title');
      }
      return;
    }

    if (this.phase === 'entering') {
      for (const k of typed) {
        if (/^[0-9]$/.test(k) && this.code.length < 4) {
          this.code += k;
          g.sfx.cursor();
        } else if (k === 'Backspace') {
          this.code = this.code.slice(0, -1);
          g.sfx.cancel();
        } else if (k === 'Escape') {
          this.phase = 'menu';
          return;
        }
      }
      for (const t of taps) {
        for (const b of NUMPAD) {
          if (Math.abs(t.x - b.x) < 55 && Math.abs(t.y - b.y) < 28) {
            if (b.label === 'けす') {
              this.code = this.code.slice(0, -1);
              g.sfx.cancel();
            } else if (b.label === 'OK') {
              this.joinRoom(g);
            } else if (this.code.length < 4) {
              this.code += b.label;
              g.sfx.cursor();
            }
          }
        }
      }
      if (g.input.confirmPressed && this.code.length === 4) this.joinRoom(g);
      return;
    }

    if (this.phase === 'hosting' || this.phase === 'joining') {
      // キャンセル(Escか画面タップ長押しは無しでシンプルに)
      for (const k of typed) {
        if (k === 'Escape') {
          this.cleanup();
          this.phase = 'menu';
          return;
        }
      }
      for (const t of taps) {
        if (inRect(t.x, t.y, { x: VIEW_W / 2 - 100, y: 430, w: 200, h: 48 })) {
          this.cleanup();
          this.phase = 'menu';
          return;
        }
      }
      return;
    }

    if (this.phase === 'error') {
      if (g.input.confirmPressed || p0.punchP || taps.length > 0) {
        this.phase = 'menu';
      }
    }
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    grad.addColorStop(0, '#101828');
    grad.addColorStop(1, '#1e3048');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    outlineText(ctx, '🌐 オンラインたいせん', VIEW_W / 2, 60, 36, '#ffd23c');

    if (this.phase === 'menu') {
      outlineText(ctx, 'あいことば(4けたの数字)で ともだちとつながろう!', VIEW_W / 2, 130, 18, '#cfe8ff');
      drawMenuItem(ctx, MENU[0], 'へやをつくる(あいことばを出す)', this.cursor === 0, this.frame);
      drawMenuItem(ctx, MENU[1], 'へやにはいる(あいことばを入れる)', this.cursor === 1, this.frame);
      drawMenuItem(ctx, MENU[2], 'タイトルへもどる', this.cursor === 2, this.frame);
      outlineText(ctx, '※2人が同時にこの画面をひらいてね(通信はWebRTC/P2P)', VIEW_W / 2, 470, 14, '#9f9fc0');
    }

    if (this.phase === 'hosting') {
      outlineText(ctx, 'あいことばは これ!', VIEW_W / 2, 150, 24, '#fff');
      // 大きくあいことば表示
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(VIEW_W / 2 - 160, 180, 320, 100);
      ctx.strokeStyle = '#ffd23c';
      ctx.lineWidth = 4;
      ctx.strokeRect(VIEW_W / 2 - 160, 180, 320, 100);
      outlineText(ctx, this.code.split('').join(' '), VIEW_W / 2, 232, 64, '#ffd23c');
      outlineText(ctx, 'あいてに この数字をおしえてね', VIEW_W / 2, 320, 20, '#fff');
      const dots = '...'.slice(0, 1 + (Math.floor(this.frame / 20) % 3));
      outlineText(ctx, `あいてを まっています${dots}`, VIEW_W / 2, 360, 20, '#8fd0ff');
      this.drawCancel(ctx);
    }

    if (this.phase === 'entering') {
      outlineText(ctx, 'あいことばを いれてね', VIEW_W / 2, 140, 24, '#fff');
      // 入力中の4けた表示
      for (let i = 0; i < 4; i++) {
        const x = VIEW_W / 2 - 150 + i * 80;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(x, 170, 70, 80);
        ctx.strokeStyle = i === this.code.length ? '#ffd23c' : '#4a5a80';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, 170, 70, 80);
        if (this.code[i]) outlineText(ctx, this.code[i], x + 35, 212, 44, '#fff');
      }
      // 数字ボタン(タッチ・クリック用)
      for (const b of NUMPAD) {
        const isOk = b.label === 'OK';
        ctx.fillStyle = isOk
          ? this.code.length === 4 ? 'rgba(255,210,60,0.9)' : 'rgba(255,210,60,0.3)'
          : 'rgba(30,40,70,0.9)';
        ctx.fillRect(b.x - 55, b.y - 27, 110, 54);
        ctx.strokeStyle = '#4a5a80';
        ctx.lineWidth = 2;
        ctx.strokeRect(b.x - 55, b.y - 27, 110, 54);
        outlineText(ctx, b.label, b.x, b.y, 26, isOk ? '#222' : '#fff');
      }
      outlineText(ctx, 'キーボードの数字でもOK(Escでもどる)', VIEW_W / 2, 522, 14, '#9f9fc0');
    }

    if (this.phase === 'joining') {
      const dots = '...'.slice(0, 1 + (Math.floor(this.frame / 20) % 3));
      outlineText(ctx, `つないでいます${dots}`, VIEW_W / 2, 240, 28, '#8fd0ff');
      outlineText(ctx, `あいことば: ${this.code}`, VIEW_W / 2, 290, 20, '#fff');
      this.drawCancel(ctx);
    }

    if (this.phase === 'error') {
      outlineText(ctx, '😢', VIEW_W / 2, 200, 60, '#fff');
      outlineText(ctx, this.errorMsg, VIEW_W / 2, 280, 22, '#ff9d9d');
      outlineText(ctx, 'タップ か こうげきキーで もどる', VIEW_W / 2, 340, 16, '#9f9fc0');
    }
    void g;
  }

  private drawCancel(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = 'rgba(30,40,70,0.9)';
    ctx.fillRect(VIEW_W / 2 - 100, 430, 200, 48);
    ctx.strokeStyle = '#4a5a80';
    ctx.lineWidth = 2;
    ctx.strokeRect(VIEW_W / 2 - 100, 430, 200, 48);
    outlineText(ctx, 'やめる (Esc)', VIEW_W / 2, 454, 20, '#fff');
  }
}
