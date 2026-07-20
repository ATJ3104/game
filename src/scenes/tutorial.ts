// ================================================================
// チュートリアル
// 「いどう → ジャンプ → こうげき → ひっさつわざ」を順番に
// 実際に入力してもらい、できたら✓と効果音でほめる練習モード。
// 相手はまったく攻撃しない練習用ダミー。Escでいつでもスキップできる。
// ステップの内容は下の STEPS データを書きかえるだけで変えられる。
// ================================================================

import { CHARACTERS } from '../characters';
import {
  Fighter, GAUGE_MAX, rectOverlap,
  type HitInfo, type Projectile, type World,
} from '../fight';
import { VIEW_W, VIEW_H, type GameCtx, type Scene } from '../game';
import { emptyPad } from '../input';
import { drawRobot } from '../robot';
import { drawStage, FLOOR_Y } from '../stage';
import { patchSave } from '../storage';
import { drawKeycaps, drawMenuItem, inRect, outlineText, type MenuRect } from './ui';

/** チュートリアルの1ステップ(データを書きかえれば内容を変えられる) */
interface TutorialStep {
  id: 'move' | 'jump' | 'attack' | 'special';
  title: string;
  desc: string; // 画面に出す説明
  keys: string[]; // キーキャップ表示
  touchDesc: string; // タッチ端末むけの説明
  goal: number; // 何回(何フレーム)できたらクリアか
  goalText: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 'move', title: 'いどう',
    desc: 'キーで 左右にあるいてみよう!', keys: ['A', 'D'],
    touchDesc: '左の十字パッドで あるいてみよう!',
    goal: 50, goalText: 'あるいた時間',
  },
  {
    id: 'jump', title: 'ジャンプ',
    desc: 'キーで 2回ジャンプしてみよう!', keys: ['スペース'],
    touchDesc: 'パッドの上で 2回ジャンプ!',
    goal: 2, goalText: 'ジャンプ',
  },
  {
    id: 'attack', title: 'こうげき',
    desc: 'パンチとキックを あいてに2回当てよう!', keys: ['J', 'K'],
    touchDesc: 'PとKボタンで 2回当てよう!',
    goal: 2, goalText: 'ヒット',
  },
  {
    id: 'special', title: 'ひっさつわざ',
    desc: 'ゲージまんタン! ひっさつわざを出そう!(しゃがみ+Lでわざ②)', keys: ['L'],
    touchDesc: '必ボタンで ひっさつわざ!',
    goal: 1, goalText: 'はつどう',
  },
];

const SKIP_BTN: MenuRect = { x: VIEW_W - 170, y: 104, w: 150, h: 40 };
const END_ITEMS: MenuRect[] = [
  { x: VIEW_W / 2 - 170, y: 300, w: 340, h: 54 },
  { x: VIEW_W / 2 - 170, y: 368, w: 340, h: 54 },
];

export class TutorialScene implements Scene, World {
  sfx!: GameCtx['sfx'];
  private player: Fighter = null!;
  private dummy: Fighter = null!;
  private projectiles: Projectile[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  private hitstopN = 0;
  private frame = 0;
  private stepIdx = 0;
  private prog = 0;
  private stepDoneT = 0; // ✓を見せている時間
  private done = false;
  private endCursor = 0;
  private prevState = 'idle';

  enter(g: GameCtx): void {
    this.sfx = g.sfx;
    this.player = new Fighter(CHARACTERS[7], 0, 300); // シュウマで練習
    this.dummy = new Fighter(CHARACTERS[5], 1, 620); // パピーは攻撃しないダミー
    this.projectiles = [];
    this.sparks = [];
    this.hitstopN = 0;
    this.frame = 0;
    this.stepIdx = 0;
    this.prog = 0;
    this.stepDoneT = 0;
    this.done = false;
    this.endCursor = 0;
    this.prevState = 'idle';
    g.input.touchUIEnabled = g.isTouch; // スマホでも練習できる
  }

  private exit(g: GameCtx): void {
    g.input.touchUIEnabled = false;
    g.goto('title');
  }

  // ---- Worldインターフェース(エフェクトはひかえめに) ----
  spawnProjectile(p: Projectile): void {
    this.projectiles.push(p);
  }

  addSpark(x: number, y: number, color: string, big: boolean): void {
    const n = big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 3.5;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 16, color });
    }
  }

  hitstop(frames: number): void {
    this.hitstopN = Math.max(this.hitstopN, frames);
  }

  shake(): void {
    // チュートリアルでは画面をゆらさない(見やすさ優先)
  }

  update(g: GameCtx): void {
    this.frame++;
    if (g.input.takeTyped().includes('Escape')) {
      // いつでもスキップできる
      g.sfx.cancel();
      this.exit(g);
      return;
    }
    const taps = g.input.takeTaps();
    for (const t of taps) {
      if (inRect(t.x, t.y, SKIP_BTN)) {
        g.sfx.cancel();
        this.exit(g);
        return;
      }
    }

    // ---- クリア後のメニュー ----
    if (this.done) {
      const p0 = g.input.getPad(0);
      const p1 = g.input.getPad(1);
      if (p0.upP || p1.upP || p0.downP || p1.downP) {
        this.endCursor = 1 - this.endCursor;
        g.sfx.cursor();
      }
      let decide = g.input.confirmPressed;
      for (const t of taps) {
        END_ITEMS.forEach((r, i) => {
          if (inRect(t.x, t.y, r)) {
            if (this.endCursor === i) decide = true;
            else {
              this.endCursor = i;
              g.sfx.cursor();
            }
          }
        });
      }
      if (decide) {
        g.sfx.confirm();
        if (this.endCursor === 0) this.enter(g); // もういちど
        else this.exit(g);
      }
      return;
    }

    // ---- 練習の進行 ----
    this.sparks = this.sparks.filter((s) => {
      s.x += s.vx;
      s.y += s.vy;
      s.vy += 0.3;
      s.life--;
      return s.life > 0;
    });

    if (this.hitstopN > 0) {
      this.hitstopN--;
      return;
    }

    const step = STEPS[this.stepIdx];
    const pad = g.input.getPad(0);
    // ひっさつわざのステップではゲージを自動でまんタンにしてあげる
    if (step.id === 'special' && this.player.state !== 'special') {
      this.player.gauge = GAUGE_MAX;
    }
    g.input.specialReady = this.player.gauge >= GAUGE_MAX;

    this.player.update(pad, this.dummy, this, false);
    this.dummy.update(this.dummyPad(), this.player, this, false);
    this.pushApart();
    this.resolveHits();
    this.updateProjectiles();
    // ダミーはたおれない(へったら自動回復)
    if (this.dummy.hp < this.dummy.maxHp * 0.35) this.dummy.hp = this.dummy.maxHp;

    // ---- ステップの成功判定 ----
    if (this.stepDoneT === 0) {
      if (step.id === 'move' && this.player.state === 'walk') this.prog++;
      if (step.id === 'jump' && this.prevState !== 'jump' && this.player.state === 'jump') this.prog++;
      if (step.id === 'special' && this.prevState !== 'special' && this.player.state === 'special') this.prog++;
      // attack はヒット時に resolveHits() でカウントする
      if (this.prog >= step.goal) {
        this.stepDoneT = 55; // ✓を見せる
        g.sfx.confirm();
      }
    } else {
      this.stepDoneT--;
      if (this.stepDoneT === 0) {
        this.stepIdx++;
        this.prog = 0;
        if (this.stepIdx >= STEPS.length) {
          this.done = true;
          patchSave({ tutorialDone: true }); // クリアを保存
          g.sfx.win();
        }
      }
    }
    this.prevState = this.player.state;
  }

  /** ダミーの入力: 攻撃はしない。はなれすぎたら近づくだけ */
  private dummyPad() {
    const pad = emptyPad();
    if (['idle', 'walk'].includes(this.dummy.state)) {
      const dist = this.player.x - this.dummy.x;
      if (Math.abs(dist) > 260) {
        if (dist > 0) pad.right = true;
        else pad.left = true;
      }
    }
    return pad;
  }

  private pushApart(): void {
    const ra = this.player.hurtbox();
    const rb = this.dummy.hurtbox();
    if (rectOverlap(ra, rb)) {
      const overlap = Math.min(ra.x + ra.w, rb.x + rb.w) - Math.max(ra.x, rb.x);
      const dir = this.player.x <= this.dummy.x ? 1 : -1;
      this.player.x -= (dir * overlap) / 2;
      this.dummy.x += (dir * overlap) / 2;
    }
  }

  /** プレイヤーの攻撃だけ当たり判定する(ダミーは攻撃しない) */
  private resolveHits(): void {
    const hit = this.player.getHit();
    if (!hit) return;
    if (this.dummy.invuln > 0) return;
    if (['knockdown', 'getup', 'ko'].includes(this.dummy.state)) return;
    if (!rectOverlap(hit.rect, this.dummy.hurtbox())) return;
    this.player.onHitLanded();
    this.landHit(hit);
  }

  private landHit(hit: HitInfo): void {
    this.dummy.takeHit(hit, this.player.x, this);
    if (hit.sfx === 'punch') this.sfx.punchHit();
    else if (hit.sfx === 'kick') this.sfx.kickHit();
    else this.sfx.specialHit();
    this.hitstop(hit.sfx === 'special' ? 8 : 5);
    if (this.stepDoneT === 0 && STEPS[this.stepIdx].id === 'attack') this.prog++;
  }

  private updateProjectiles(): void {
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.life--;
      if (p.life <= 0 || p.x < -60 || p.x > VIEW_W + 60) p.dead = true;
      if (p.dead) continue;
      const rect = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
      if (
        this.dummy.invuln <= 0 &&
        !['knockdown', 'getup', 'ko'].includes(this.dummy.state) &&
        rectOverlap(rect, this.dummy.hurtbox())
      ) {
        this.landHit({
          rect, dmg: p.dmg, kb: 6, hitstun: 22, blockstun: 14, launch: false, heavy: true, sfx: 'special',
        });
        this.addSpark(p.x, p.y, p.color, true);
        p.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  draw(g: GameCtx, ctx: CanvasRenderingContext2D): void {
    drawStage(ctx, 2, this.player.cfg.colors.accent, this.frame); // 明るいビーチで練習

    // 影とファイター
    for (const f of [this.dummy, this.player]) {
      const s = f.cfg.bodyScale;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(f.x, FLOOR_Y + 6, 34 * s, 8 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      const a = f.animState();
      ctx.save();
      ctx.translate(f.x, f.y);
      drawRobot(ctx, f.cfg, a.anim, a.t, a.progress, f.facing, { blend: f.poseBlend });
      ctx.restore();
    }

    // 飛び道具・パーティクル
    for (const p of this.projectiles) {
      ctx.save();
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);
      ctx.restore();
    }
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, s.life / 10);
      ctx.fillStyle = s.color;
      ctx.fillRect(s.x - 2, s.y - 2, 5, 5);
    }
    ctx.globalAlpha = 1;

    // ---- 上部の説明パネル ----
    const step = STEPS[this.stepIdx];
    ctx.fillStyle = 'rgba(10, 12, 30, 0.85)';
    ctx.fillRect(110, 10, 740, 86);
    ctx.strokeStyle = '#ffd23c';
    ctx.lineWidth = 2;
    ctx.strokeRect(110, 10, 740, 86);
    if (!this.done) {
      outlineText(ctx, `ステップ${this.stepIdx + 1}: ${step.title}`, 130, 34, 20, '#ffd23c', 'left');
      outlineText(ctx, g.isTouch ? step.touchDesc : step.desc, 130, 66, 16, '#fff', 'left');
      if (!g.isTouch) drawKeycaps(ctx, 620, 34, step.keys, 14);
      // 進行度
      outlineText(ctx, `${step.goalText}: ${Math.min(this.prog, step.goal)} / ${step.goal}`, 700, 66, 15, '#8fd0ff', 'left');
    } else {
      outlineText(ctx, '🎉 チュートリアルクリア! これでバッチリ!', VIEW_W / 2 - 30, 53, 22, '#ffd23c');
    }

    // ステップのチェックリスト(左上にまとめて表示)
    STEPS.forEach((s, i) => {
      const y = 120 + i * 30;
      const cleared = i < this.stepIdx || this.done;
      const active = i === this.stepIdx && !this.done;
      outlineText(ctx, cleared ? '✅' : active ? '▶' : '・', 40, y, 16, cleared ? '#7fe97f' : '#ffd23c', 'left');
      outlineText(ctx, s.title, 70, y, 15, cleared ? '#7fe97f' : active ? '#fff' : '#9f9fc0', 'left');
    });

    // ステップ達成の✓ポップ
    if (this.stepDoneT > 0) {
      const pop = Math.max(0, this.stepDoneT - 45) * 6;
      outlineText(ctx, '✓ できた!', VIEW_W / 2, 240, 52 + pop, '#7fe97f');
    }

    // ひっさつわざステップ用のゲージ表示
    if (!this.done && step.id === 'special') {
      ctx.fillStyle = '#101020';
      ctx.fillRect(30, VIEW_H - 26, 300, 14);
      ctx.fillStyle = this.frame % 20 < 10 ? '#fff' : this.player.cfg.special.color;
      ctx.fillRect(30, VIEW_H - 26, 300 * (this.player.gauge / GAUGE_MAX), 14);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(30, VIEW_H - 26, 300, 14);
      outlineText(ctx, 'ゲージまんタン!', 180, VIEW_H - 40, 14, '#ffd23c');
    }

    // スキップボタン
    ctx.fillStyle = 'rgba(30,40,70,0.9)';
    ctx.fillRect(SKIP_BTN.x, SKIP_BTN.y, SKIP_BTN.w, SKIP_BTN.h);
    ctx.strokeStyle = '#4a5a80';
    ctx.lineWidth = 2;
    ctx.strokeRect(SKIP_BTN.x, SKIP_BTN.y, SKIP_BTN.w, SKIP_BTN.h);
    outlineText(ctx, 'スキップ (Esc)', SKIP_BTN.x + SKIP_BTN.w / 2, SKIP_BTN.y + SKIP_BTN.h / 2, 15, '#fff');

    // クリア後のメニュー
    if (this.done) {
      drawMenuItem(ctx, END_ITEMS[0], 'もういちど れんしゅう', this.endCursor === 0, this.frame);
      drawMenuItem(ctx, END_ITEMS[1], 'タイトルへもどる', this.endCursor === 1, this.frame);
    }

    g.input.drawTouchUI(ctx);
  }
}
