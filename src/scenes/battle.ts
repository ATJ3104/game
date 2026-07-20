// ================================================================
// バトル画面(ゲームの中心!)
// ラウンド制(99秒・2本先取)、KOスロー演出、ヒットストップ、
// 画面シェイク、パーティクル、必殺ゲージなどをここでまとめる。
// ================================================================

import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import {
  Fighter, GAUGE_MAX, rectOverlap, STAGE_LEFT, STAGE_RIGHT,
  type HitInfo, type Projectile, type World,
} from '../fight';
import { CpuBrain } from '../ai';
import { drawRobot } from '../robot';
import { drawStage, FLOOR_Y } from '../stage';
import type { PadState } from '../input';
import { INPUT_DELAY, encodePad, decodePad } from '../net';
import { FONT, outlineText } from './ui';

const ROUND_TIME = 99;
const WINS_NEEDED = 2;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

type Phase = 'intro' | 'fight' | 'ko' | 'roundEnd' | 'matchEnd';

export class BattleScene implements Scene, World {
  sfx!: GameCtx['sfx'];
  private fighters: [Fighter, Fighter] = null!;
  private brain: CpuBrain | null = null;
  private projectiles: Projectile[] = [];
  private sparks: Spark[] = [];
  private phase: Phase = 'intro';
  private phaseT = 0;
  private frame = 0;
  private hitstopN = 0;
  private shakeMag = 0;
  private timeLeft = ROUND_TIME;
  private roundNo = 1;
  private slowCounter = 0;
  private roundWinnerName = '';
  private koByTimeup = false;
  // オンライン対戦(ロックステップ)用
  private simFrame = 0; // 何フレーム目まで進んだか
  private stallT = 0; // 相手の入力まちが続いているフレーム数
  private matchOver = false;

  enter(g: GameCtx): void {
    this.sfx = g.sfx;
    this.fighters = [new Fighter(g.p1, 0, 300), new Fighter(g.p2, 1, 660)];
    this.brain = g.mode === 'cpu' ? new CpuBrain(g.difficulty) : null;
    this.projectiles = [];
    this.sparks = [];
    this.roundNo = 1;
    this.simFrame = 0;
    this.stallT = 0;
    this.matchOver = false;
    if (g.mode === 'online' && g.net) g.net.newBattle(); // 入力バッファをリセット
    this.startRound();
    g.input.touchUIEnabled = g.isTouch && g.mode !== 'vs';
  }

  private startRound(): void {
    this.fighters[0].resetForRound(300);
    this.fighters[1].resetForRound(660);
    this.projectiles = [];
    this.phase = 'intro';
    this.phaseT = 0;
    this.timeLeft = ROUND_TIME;
    this.koByTimeup = false;
  }

  // ---- Worldインターフェース(ファイターからエフェクトを出す窓口) ----
  spawnProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  addSpark(x: number, y: number, color: string, big: boolean): void {
    const n = big ? 14 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * (big ? 5 : 3);
      this.sparks.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 14 + Math.random() * 10,
        color,
        size: big ? 6 : 4,
      });
    }
  }

  hitstop(frames: number): void {
    this.hitstopN = Math.max(this.hitstopN, frames);
  }

  shake(mag: number): void {
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  // ---- 更新 ----
  update(g: GameCtx): void {
    // パーティクルは見た目だけなので同期に関係なく毎回動かす
    g.input.takeTaps(); // バトル中のタップは仮想パッドが処理する
    g.input.specialReady = this.fighters[0].gauge >= GAUGE_MAX;
    this.sparks = this.sparks.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.3;
      s.life--;
      return s.life > 0;
    });

    if (g.mode === 'online') {
      this.updateOnline(g);
      return;
    }

    // オフライン: そのまま1フレーム進める(2PはキーボードかCPU)
    const locked = this.phase !== 'fight';
    const pad0 = g.input.getPad(0);
    const pad1 = this.brain && !locked
      ? this.brain.update(this.fighters[1], this.fighters[0])
      : g.input.getPad(1);
    this.stepSim(g, pad0, pad1);
  }

  /**
   * オンライン対戦: ロックステップ同期
   * 自分の入力を少し先のフレームに予約して送り、
   * おたがいの入力がそろったフレームだけシミュレーションを進める。
   * 同じ入力で同じ計算をするので、2人の画面はずれない。
   */
  private updateOnline(g: GameCtx): void {
    const net = g.net;
    if (!net || net.closed) {
      // 通信が切れた → タイトルへもどる
      net?.close();
      g.net = null;
      g.input.touchUIEnabled = false;
      g.goto('title');
      return;
    }
    for (const m of net.takeCtrl()) {
      if (m.t === 'quit') {
        net.close();
        g.net = null;
        g.input.touchUIEnabled = false;
        g.goto('title');
        return;
      }
      // rematch などはリザルト画面で処理する
    }
    // 1) 自分の入力を先のフレームに予約して送る(1tickに最大2フレームぶん)
    const target = this.simFrame + INPUT_DELAY;
    let sent = 0;
    while (net.lastScheduled < target && sent < 2) {
      net.scheduleLocal(net.lastScheduled + 1, encodePad(g.input.getPad(0)));
      sent++;
    }
    // 2) 両方の入力がそろったフレームだけ進める(最大3=おくれたら追いつく)
    let steps = 0;
    let advanced = false;
    while (steps < 3 && !this.matchOver) {
      const f = this.simFrame;
      const lb = net.localInput(f);
      const rb = net.remoteInput(f);
      if (lb === undefined || rb === undefined) break; // 相手の入力まち
      const lp = f > 0 ? net.localInput(f - 1) ?? 0 : 0;
      const rp = f > 0 ? net.remoteInput(f - 1) ?? 0 : 0;
      const myPad = decodePad(lb, lp);
      const foePad = decodePad(rb, rp);
      this.stepSim(g, net.side === 0 ? myPad : foePad, net.side === 0 ? foePad : myPad);
      this.simFrame++;
      steps++;
      advanced = true;
    }
    this.stallT = advanced ? 0 : this.stallT + 1;
  }

  /** ゲームを1フレームぶん進める(オンラインでは両者で同じ計算になる) */
  private stepSim(g: GameCtx, pad0: PadState, pad1: PadState): void {
    this.frame++;

    if (this.hitstopN > 0) {
      // ヒットストップ: 両者を数フレーム止めて打撃感を出す
      this.hitstopN--;
      return;
    }

    // KOスローモーション: 3フレームに1回だけロジックを進める
    if (this.phase === 'ko' && this.phaseT < 34) {
      this.slowCounter = (this.slowCounter + 1) % 3;
      if (this.slowCounter !== 0) {
        return;
      }
    }

    this.phaseT++;
    if (this.shakeMag > 0) this.shakeMag = Math.max(0, this.shakeMag - 0.4);

    const [f0, f1] = this.fighters;
    const locked = this.phase !== 'fight';

    f0.update(pad0, f1, this, locked);
    f1.update(pad1, f0, this, locked);

    if (this.phase === 'fight' || this.phase === 'intro') {
      this.pushApart(f0, f1);
    }

    if (this.phase === 'fight') {
      // ゲージは時間でも少したまる
      for (const f of this.fighters) f.gauge = Math.min(GAUGE_MAX, f.gauge + 0.045);

      // 攻撃の当たり判定
      this.resolveHit(f0, f1);
      this.resolveHit(f1, f0);
      this.updateProjectiles();

      // タイマー(60フレーム=1秒)
      if (this.frame % 60 === 0 && this.timeLeft > 0) {
        this.timeLeft--;
        if (this.timeLeft <= 5 && this.timeLeft > 0) this.sfx.timeCount();
      }

      // KO判定
      const dead = this.fighters.find((f) => f.hp <= 0);
      if (dead) {
        this.beginKO(false);
      } else if (this.timeLeft <= 0) {
        this.beginKO(true);
      }
    }

    if (this.phase === 'intro' && this.phaseT === 60) this.sfx.roundGo();
    if (this.phase === 'intro' && this.phaseT >= 60) {
      // "FIGHT!" 表示後に操作解禁
      this.phase = 'fight';
      this.phaseT = 60; // 表示のこりのため引き継ぐ
    }

    if (this.phase === 'ko' && this.phaseT >= 100) {
      this.endRound(g);
    }
    if (this.phase === 'roundEnd' && this.phaseT >= 100) {
      const champ = this.fighters.find((f) => f.roundWins >= WINS_NEEDED);
      if (champ) {
        g.winnerSide = champ.side;
        this.phase = 'matchEnd';
        this.phaseT = 0;
      } else {
        this.roundNo++;
        this.startRound();
      }
    }
    if (this.phase === 'matchEnd' && this.phaseT >= 40) {
      g.input.touchUIEnabled = false;
      this.matchOver = true;
      g.goto('result');
    }
  }

  /** KO(またはタイムアップ)演出を始める */
  private beginKO(timeup: boolean): void {
    this.phase = 'ko';
    this.phaseT = 0;
    this.koByTimeup = timeup;
    this.slowCounter = 0;
    if (!timeup) {
      this.sfx.ko();
      this.shake(9);
      this.hitstop(10);
    }
  }

  /** ラウンドの勝敗を確定する */
  private endRound(g: GameCtx): void {
    const [f0, f1] = this.fighters;
    let winner: Fighter | null = null;
    if (this.koByTimeup) {
      // タイムアップ: HPが多いほうの勝ち(同じならひきわけ→もう1回)
      if (f0.hp > f1.hp) winner = f0;
      else if (f1.hp > f0.hp) winner = f1;
    } else {
      winner = f0.hp <= 0 ? f1 : f0;
    }
    if (winner) {
      winner.roundWins++;
      winner.state = 'win';
      winner.timer = 0;
      this.roundWinnerName = `${winner.cfg.name} のかち!`;
      this.sfx.win();
    } else {
      this.roundWinnerName = 'ひきわけ!';
    }
    g.winnerSide = winner ? winner.side : 0;
    this.phase = 'roundEnd';
    this.phaseT = 0;
  }

  /** 両者が重ならないように押し合いする */
  private pushApart(a: Fighter, b: Fighter): void {
    const ra = a.hurtbox();
    const rb = b.hurtbox();
    if (rectOverlap(ra, rb) && a.state !== 'ko' && b.state !== 'ko') {
      const overlap = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
      const dir = a.x <= b.x ? 1 : -1;
      a.x -= (dir * overlap) / 2;
      b.x += (dir * overlap) / 2;
      a.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, a.x));
      b.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, b.x));
    }
  }

  /** attacker の攻撃判定を defender に当てる */
  private resolveHit(attacker: Fighter, defender: Fighter): void {
    const hit = attacker.getHit();
    if (!hit) return;
    if (defender.invuln > 0) return;
    if (defender.state === 'knockdown' || defender.state === 'getup' || defender.state === 'ko') return;
    if (!rectOverlap(hit.rect, defender.hurtbox())) return;

    attacker.onHitLanded();
    this.applyHit(attacker.x, attacker.side, hit, defender);
    if (defender.hp > 0 || true) {
      attacker.gauge = Math.min(GAUGE_MAX, attacker.gauge + 7); // 当てるとゲージがたまる
    }
  }

  /** ヒットかガードかを判定してダメージ処理する(飛び道具もここを通る) */
  private applyHit(fromX: number, _fromSide: number, hit: HitInfo, defender: Fighter): void {
    const guard = defender.isGuarding(fromX);
    if (guard.ok) {
      defender.takeBlock(hit, fromX, guard.low, this);
      this.hitstop(3);
      return;
    }
    defender.takeHit(hit, fromX, this);
    // 打撃音とエフェクト
    if (hit.sfx === 'punch') this.sfx.punchHit();
    else if (hit.sfx === 'kick') this.sfx.kickHit();
    else this.sfx.specialHit();
    this.hitstop(hit.sfx === 'special' ? 9 : 6);
    if (hit.heavy) this.shake(hit.sfx === 'special' ? 7 : 4);
  }

  /** 飛び道具の移動と当たり判定 */
  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.life--;
      if (p.life <= 0 || p.x < -60 || p.x > VIEW_W + 60) p.dead = true;
      if (p.dead) continue;
      const target = this.fighters[p.owner === 0 ? 1 : 0];
      if (target.invuln > 0 || target.state === 'knockdown' || target.state === 'getup' || target.state === 'ko') continue;
      const rect = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      if (rectOverlap(rect, target.hurtbox())) {
        const info: HitInfo = {
          rect,
          dmg: p.dmg,
          kb: 6,
          hitstun: 22,
          blockstun: 14,
          launch: false,
          heavy: true,
          sfx: 'special',
        };
        this.applyHit(p.x - p.vx * 8, p.owner, info, target);
        this.addSpark(p.x, p.y, p.color, true);
        p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ---- 描画 ----
  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    ctx.save();
    // 画面シェイク
    if (this.shakeMag > 0.2) {
      ctx.translate(
        (Math.random() - 0.5) * this.shakeMag * 2,
        (Math.random() - 0.5) * this.shakeMag * 2,
      );
    }

    drawStage(ctx, g.stageIndex, g.p1.colors.accent, this.frame);

    // 影
    for (const f of this.fighters) {
      const s = f.cfg.bodyScale;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(f.x, FLOOR_Y + 6, 34 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // ファイター(やられ点滅は2フレームごとにチカチカ)
    for (const f of this.fighters) {
      const a = f.animState();
      const flash = f.flash > 0 && f.flash % 2 === 0;
      const blink = f.invuln > 0 && f.state === 'getup' && f.animT % 4 < 2;
      ctx.save();
      ctx.translate(f.x, f.y);
      drawRobot(ctx, f.cfg, a.anim, a.t, a.progress, f.facing, {
        flash,
        alpha: blink ? 0.4 : 1,
        blend: f.poseBlend, // ポーズの切りかわりをなめらかにする
      });
      ctx.restore();
    }

    // 飛び道具(光る弾)
    for (const p of this.projectiles) {
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = p.color;
      const wob = Math.sin(this.frame * 0.5) * 3;
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2 + wob * 0.3, p.w, p.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x - p.w / 4, p.y - p.h / 4, p.w / 2, p.h / 2);
      ctx.restore();
    }

    // パーティクル
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, s.life / 10);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;

    // かけごえの吹き出し
    for (const f of this.fighters) {
      if (!f.shout) continue;
      const bx = f.x;
      const by = f.y - 158 * f.cfg.bodyScale;
      ctx.font = `bold 20px ${FONT}`;
      const w = ctx.measureText(f.shout.text).width + 24;
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 3;
      const rx = Math.max(6, Math.min(VIEW_W - w - 6, bx - w / 2));
      ctx.fillRect(rx, by - 20, w, 34);
      ctx.strokeRect(rx, by - 20, w, 34);
      // しっぽ
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + 14);
      ctx.lineTo(bx + 6, by + 14);
      ctx.lineTo(bx, by + 26);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.shout.text, rx + w / 2, by - 2);
    }

    ctx.restore(); // シェイクここまで

    this.drawHUD(g, ctx);
    g.input.drawTouchUI(ctx);
    this.drawOverlay(ctx);

    // オンラインで相手の入力を待っているときの表示
    if (g.mode === 'online' && this.stallT > 30) {
      outlineText(ctx, 'つうしんちゅう...', VIEW_W / 2, 130, 22, '#8fd0ff');
    }
  }

  /** HPバー・タイマー・必殺ゲージなどのUI */
  private drawHUD(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    const [f0, f1] = this.fighters;
    const barW = 360;
    const barH = 22;
    const y = 24;

    const drawHP = (f: Fighter, x: number, rightAlign: boolean): void => {
      ctx.fillStyle = '#3a0a0a';
      ctx.fillRect(x, y, barW, barH);
      const ratio = f.hp / f.maxHp;
      const w = barW * ratio;
      // HPが少なくなると色が変わる
      ctx.fillStyle = ratio > 0.5 ? '#ffd23c' : ratio > 0.25 ? '#ff9d3c' : '#ff4040';
      ctx.fillRect(rightAlign ? x + barW - w : x, y, w, barH);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, barW, barH);
      // 名前(バーの外側)とラウンド取得マーク(バーの内側=画面中央より)
      outlineText(ctx, f.cfg.name, rightAlign ? x : x + barW, y + 40, 18, '#fff', rightAlign ? 'left' : 'right');
      for (let i = 0; i < WINS_NEEDED; i++) {
        const mx = rightAlign ? x + barW - 14 - i * 26 : x + 14 + i * 26;
        ctx.fillStyle = i < f.roundWins ? '#ffd23c' : 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.arc(mx, y + 40, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    drawHP(f0, 30, true);
    drawHP(f1, VIEW_W - 30 - barW, false);

    // タイマー
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(VIEW_W / 2 - 44, 10, 88, 52);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.strokeRect(VIEW_W / 2 - 44, 10, 88, 52);
    outlineText(ctx, String(this.timeLeft), VIEW_W / 2, 37, 38, this.timeLeft <= 10 ? '#ff5050' : '#fff');

    // 必殺ゲージ(画面下)
    const gw = 300;
    const gy = VIEW_H - 26;
    const drawGauge = (f: Fighter, x: number, hint: string): void => {
      ctx.fillStyle = '#101020';
      ctx.fillRect(x, gy, gw, 14);
      const full = f.gauge >= GAUGE_MAX;
      ctx.fillStyle = full ? (this.frame % 20 < 10 ? '#fff' : f.cfg.special.color) : f.cfg.special.color;
      ctx.fillRect(x, gy, gw * (f.gauge / GAUGE_MAX), 14);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, gy, gw, 14);
      if (full) {
        // どのボタンで出すかも表示する(そうさに迷わないように)
        outlineText(ctx, `ひっさつOK! ①${f.cfg.special.name} ②${f.cfg.special2.name}${hint}`, x + gw / 2, gy - 12, 12, '#ffd23c');
      }
    };
    drawGauge(f0, 30, g.isTouch ? ' [①必/②↓+必]' : ' [①L/②↓+L]');
    drawGauge(f1, VIEW_W - 30 - gw, g.mode === 'vs' ? ' [①3/②↓+3]' : '');

    // ラウンド数表示
    outlineText(ctx, `ラウンド ${this.roundNo}`, VIEW_W / 2, 74, 15, '#cfcfe8');
    void g;
  }

  /** READY/FIGHT/KO などの大きな文字演出 */
  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    if (this.phase === 'intro' || (this.phase === 'fight' && this.phaseT < 85)) {
      if (this.phaseT < 60) {
        outlineText(ctx, 'READY...', VIEW_W / 2, VIEW_H / 2 - 20, 60, '#8fd0ff');
      } else {
        const t = this.phaseT - 60;
        const size = 90 + Math.max(0, 20 - t) * 3;
        outlineText(ctx, 'FIGHT!', VIEW_W / 2, VIEW_H / 2 - 20, size, '#ffd23c');
      }
    }
    if (this.phase === 'ko') {
      const t = this.phaseT;
      const size = Math.min(150, 40 + t * 10);
      if (this.koByTimeup) {
        outlineText(ctx, 'TIME UP', VIEW_W / 2, VIEW_H / 2 - 20, Math.min(100, size), '#8fd0ff');
      } else {
        outlineText(ctx, 'K.O.', VIEW_W / 2, VIEW_H / 2 - 20, size, '#ff4040');
      }
    }
    if (this.phase === 'roundEnd' || this.phase === 'matchEnd') {
      outlineText(ctx, this.roundWinnerName, VIEW_W / 2, VIEW_H / 2 - 20, 52, '#ffd23c');
    }
  }
}
