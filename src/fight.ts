// ================================================================
// 対戦ロジックの中心
// ファイターの状態(立ち/歩き/ジャンプ/攻撃/やられ…)、当たり判定、
// ダメージ、必殺技4タイプ、飛び道具をここで処理する。
// 当たり判定は「矩形hitbox(攻撃) vs 矩形hurtbox(くらい)」の単純方式。
// ================================================================

import type { RobotConfig, SpecialConfig } from './characters';
import type { PadState } from './input';
import type { Sfx } from './audio';
import type { AnimName, Pose } from './robot';
import { FLOOR_Y } from './stage';

export const STAGE_LEFT = 45;
export const STAGE_RIGHT = 915;
export const GAUGE_MAX = 100;

const WALK = 3.1; // 歩く速さの基準(px/フレーム)
const GRAV = 0.62; // 重力
const JUMP_VY = -13.2; // ジャンプ初速の基準
const JUMP_VX = 4.4; // 前後ジャンプの横速度

/** 矩形(当たり判定用) */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function rectOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** 通常技のデータ。hbは「足元原点・右向き」のときの攻撃判定 */
interface AttackSpec {
  dmg: number;
  startup: number; // 発生までのフレーム
  active: number; // 攻撃判定が出ているフレーム
  recovery: number; // 硬直フレーム
  hb: Rect;
  kb: number; // ノックバック
  hitstun: number;
  blockstun: number;
  anim: AnimName;
  sfx: 'punch' | 'kick';
  sweep?: boolean; // 当たると相手がダウンする(足ばらい)
}

// 通常技テーブル(全キャラ共通。attackPowerとbodyScaleでキャラ差が出る)
// 判定の高さは6頭身リグ(肩 約-97px・全高 約125px)に合わせてある
const ATTACKS: Record<string, AttackSpec> = {
  standP: { dmg: 55, startup: 4, active: 4, recovery: 9, hb: { x: 20, y: -108, w: 58, h: 24 }, kb: 3, hitstun: 14, blockstun: 10, anim: 'punch', sfx: 'punch' },
  standK: { dmg: 82, startup: 9, active: 5, recovery: 16, hb: { x: 22, y: -96, w: 72, h: 26 }, kb: 5, hitstun: 19, blockstun: 13, anim: 'kick', sfx: 'kick' },
  crouchP: { dmg: 45, startup: 4, active: 4, recovery: 8, hb: { x: 18, y: -64, w: 56, h: 20 }, kb: 2.5, hitstun: 12, blockstun: 9, anim: 'crouchPunch', sfx: 'punch' },
  crouchK: { dmg: 72, startup: 8, active: 5, recovery: 18, hb: { x: 18, y: -22, w: 76, h: 20 }, kb: 4, hitstun: 20, blockstun: 13, anim: 'crouchKick', sfx: 'kick', sweep: true },
  jumpK: { dmg: 78, startup: 6, active: 14, recovery: 4, hb: { x: 10, y: -76, w: 62, h: 38 }, kb: 4, hitstun: 17, blockstun: 12, anim: 'jumpKick', sfx: 'kick' },
};

/** ヒット時の情報(通常技・必殺技・飛び道具で共通のかたち) */
export interface HitInfo {
  rect: Rect;
  dmg: number; // 最終ダメージ(倍率計算済み)
  kb: number;
  hitstun: number;
  blockstun: number;
  launch: boolean; // 相手を打ち上げ/ダウンさせるか
  heavy: boolean; // 画面シェイクするか
  sfx: 'punch' | 'kick' | 'special';
}

/** 飛び道具 */
export interface Projectile {
  x: number;
  y: number;
  vx: number;
  w: number;
  h: number;
  dmg: number;
  owner: 0 | 1;
  color: string;
  life: number;
  dead: boolean;
}

/** バトルシーンが提供する「世界」への窓口(エフェクトや音を出す) */
export interface World {
  sfx: Sfx;
  spawnProjectile(p: Projectile): void;
  addSpark(x: number, y: number, color: string, big: boolean): void;
  hitstop(frames: number): void;
  shake(mag: number): void;
}

export type FState =
  | 'idle' | 'walk' | 'crouch' | 'jump' | 'dash'
  | 'attack' | 'special'
  | 'hitstun' | 'blockstun' | 'launched' | 'knockdown' | 'getup'
  | 'ko' | 'win';

const DASH_WINDOW = 14; // DD入力の受付フレーム(この間に同じ方向をもう1回)
const DASH_TIME = 13; // ダッシュの長さ
const DASH_SPEED = 8.6;

export class Fighter {
  cfg: RobotConfig;
  side: 0 | 1;
  x: number;
  y: number = FLOOR_Y; // yは足元。FLOOR_Yで接地
  vx = 0;
  vy = 0;
  facing: 1 | -1;
  hp: number;
  maxHp: number;
  gauge = 0;
  roundWins = 0;

  state: FState = 'idle';
  timer = 0; // いまの状態になってからのフレーム数
  animT = 0; // 見た目アニメ用の通しフレーム
  attack: AttackSpec | null = null;
  hasHit = false; // この攻撃がもう当たったか
  spinHits = 0; // 回転必殺技の多段ヒット数
  rehitTimer = 0;
  stunDur = 0; // のけぞり時間
  invuln = 0; // 無敵時間
  flash = 0; // ダメージ点滅
  shout: { text: string; timer: number } | null = null;
  lastPad: PadState | null = null;
  crouchingAttack = false; // しゃがみ技中(くらい判定を低くする)
  activeSp: SpecialConfig; // いま出しているひっさつわざ(①か②)
  /** 見た目専用: ポーズブレンドの入れもの(同期には影響しない) */
  poseBlend: { pose: Pose | null } = { pose: null };
  private dashBufDir: -1 | 0 | 1 = 0; // DD入力用: 前回おした方向
  private dashBufT = 99; // 前回おしてからのフレーム数
  private dashDir: -1 | 1 = 1; // ダッシュしている方向

  constructor(cfg: RobotConfig, side: 0 | 1, x: number) {
    this.cfg = cfg;
    this.side = side;
    this.x = x;
    this.facing = side === 0 ? 1 : -1;
    this.maxHp = cfg.stats.hp;
    this.hp = cfg.stats.hp;
    this.activeSp = cfg.special;
  }

  /** ラウンド開始時のリセット */
  resetForRound(x: number): void {
    this.x = x;
    this.y = FLOOR_Y;
    this.vx = 0;
    this.vy = 0;
    this.hp = this.maxHp;
    this.gauge = Math.min(this.gauge, GAUGE_MAX * 0.3); // ゲージは少しだけ持ちこし
    this.state = 'idle';
    this.timer = 0;
    this.attack = null;
    this.invuln = 0;
    this.flash = 0;
    this.shout = null;
    this.facing = this.side === 0 ? 1 : -1;
  }

  get onGround(): boolean {
    return this.y >= FLOOR_Y - 0.5;
  }

  get crouching(): boolean {
    return this.state === 'crouch' || this.crouchingAttack ||
      (this.state === 'blockstun' && this.stunLow);
  }
  stunLow = false; // しゃがみガード中か

  /** くらい判定(hurtbox)。しゃがむと低くなる */
  hurtbox(): Rect {
    const s = this.cfg.bodyScale;
    const w = 46 * s;
    const h = (this.crouching ? 84 : 124) * s;
    if (this.state === 'knockdown' || this.state === 'ko') {
      return { x: this.x - 40 * s, y: this.y - 26 * s, w: 80 * s, h: 26 * s };
    }
    return { x: this.x - w / 2, y: this.y - h, w, h };
  }

  private setState(s: FState): void {
    this.state = s;
    this.timer = 0;
  }

  /** 状態を変える(同じ状態ならタイマーを維持) */
  private setStateKeep(s: FState): void {
    if (this.state !== s) this.setState(s);
  }

  private startAttack(id: string): void {
    this.attack = ATTACKS[id];
    this.hasHit = false;
    this.crouchingAttack = id.startsWith('crouch');
    this.vx = 0;
    this.setState('attack');
  }

  private startJump(pad: PadState, world: World): void {
    this.vy = JUMP_VY * this.cfg.stats.jumpPower;
    this.vx = (pad.right ? 1 : 0) * JUMP_VX - (pad.left ? 1 : 0) * JUMP_VX;
    this.attack = null;
    this.setState('jump');
    world.sfx.jump();
  }

  private startSpecial(world: World, sp: SpecialConfig): void {
    this.activeSp = sp;
    this.gauge = 0;
    this.hasHit = false;
    this.spinHits = 0;
    this.crouchingAttack = false;
    this.vx = 0;
    this.setState('special');
    this.shout = { text: sp.shout, timer: 55 };
    world.sfx.special();
  }

  /** DD(同じ方向2回)ダッシュを始める */
  private startDash(dir: -1 | 1, world: World): void {
    this.dashDir = dir;
    this.vx = dir * DASH_SPEED * this.cfg.stats.walkSpeed;
    this.dashBufDir = 0;
    this.dashBufT = 99;
    this.setState('dash');
    world.sfx.dash();
  }

  /** 1フレーム分の更新。padは自分の入力、foeは相手 */
  update(pad: PadState, foe: Fighter, world: World, inputLocked: boolean): void {
    if (inputLocked) pad = { ...pad, left: false, right: false, up: false, down: false, punch: false, kick: false, special: false, punchP: false, kickP: false, specialP: false, leftP: false, rightP: false, upP: false, downP: false };
    this.lastPad = pad;
    this.animT++;
    this.timer++;
    if (this.flash > 0) this.flash--;
    if (this.invuln > 0) this.invuln--;
    if (this.shout) {
      this.shout.timer--;
      if (this.shout.timer <= 0) this.shout = null;
    }
    this.dashBufT++; // DD入力の受付時間をすすめる

    // 向きの自動更新(行動中でなければ相手の方を向く)
    if (['idle', 'walk', 'crouch'].includes(this.state)) {
      this.facing = foe.x >= this.x ? 1 : -1;
    }

    switch (this.state) {
      case 'idle':
      case 'walk': {
        this.crouchingAttack = false;
        // DD(同じ方向を2回すばやく)でダッシュ
        const tapDir = pad.rightP ? 1 : pad.leftP ? -1 : 0;
        if (tapDir !== 0) {
          if (tapDir === this.dashBufDir && this.dashBufT <= DASH_WINDOW) {
            this.startDash(tapDir as -1 | 1, world);
            break;
          }
          this.dashBufDir = tapDir as -1 | 1;
          this.dashBufT = 0;
        }
        if (pad.specialP && this.gauge >= GAUGE_MAX) { this.startSpecial(world, this.cfg.special); break; }
        if (pad.punchP) { this.startAttack('standP'); world.sfx.whiff(); break; }
        if (pad.kickP) { this.startAttack('standK'); world.sfx.whiff(); break; }
        if (pad.up) { this.startJump(pad, world); break; }
        if (pad.down) { this.setState('crouch'); this.vx = 0; break; }
        const dir = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
        if (dir !== 0) {
          this.setStateKeep('walk');
          this.vx = dir * WALK * this.cfg.stats.walkSpeed;
        } else {
          this.setStateKeep('idle');
          this.vx = 0;
        }
        break;
      }
      case 'dash': {
        // ダッシュ中: だんだん減速して終わる
        this.vx = this.dashDir * DASH_SPEED * this.cfg.stats.walkSpeed * (1 - this.timer / (DASH_TIME + 4));
        if (this.timer >= DASH_TIME) {
          this.vx = 0;
          this.setState('idle');
        }
        break;
      }
      case 'crouch': {
        this.vx = 0;
        if (!pad.down) { this.setState('idle'); break; }
        // しゃがみ+ひっさつボタン = ひっさつわざ②!
        if (pad.specialP && this.gauge >= GAUGE_MAX) { this.startSpecial(world, this.cfg.special2); break; }
        if (pad.punchP) { this.startAttack('crouchP'); world.sfx.whiff(); break; }
        if (pad.kickP) { this.startAttack('crouchK'); world.sfx.whiff(); break; }
        break;
      }
      case 'jump': {
        // 空中攻撃(ジャンプキック)
        if ((pad.punchP || pad.kickP) && !this.attack) {
          this.attack = ATTACKS.jumpK;
          this.hasHit = false;
          this.timer = 0; // 攻撃の進行はtimerで数え直す
          world.sfx.whiff();
        }
        break;
      }
      case 'attack': {
        const a = this.attack;
        if (a && this.timer >= a.startup + a.active + a.recovery) {
          this.attack = null;
          this.crouchingAttack = false;
          this.setState(pad.down ? 'crouch' : 'idle');
        }
        break;
      }
      case 'special':
        this.updateSpecial(world);
        break;
      case 'hitstun': {
        this.vx *= 0.86;
        if (this.timer >= this.stunDur) this.setState('idle');
        break;
      }
      case 'blockstun': {
        this.vx *= 0.82;
        if (this.timer >= this.stunDur) this.setState(this.stunLow ? 'crouch' : 'idle');
        break;
      }
      case 'launched':
        // 空中をふっとび中。着地処理は物理のところで行う
        break;
      case 'knockdown': {
        this.vx *= 0.85;
        if (this.timer >= 42) {
          this.setState('getup');
          this.invuln = 40; // 起き上がりは少し無敵
        }
        break;
      }
      case 'getup': {
        if (this.timer >= 18) this.setState('idle');
        break;
      }
      case 'ko':
      case 'win':
        this.vx *= 0.9;
        break;
    }

    // ---- 物理(重力・移動・地面・画面はし) ----
    if (!this.onGround || this.vy < 0) this.vy += GRAV;
    this.x += this.vx;
    this.y += this.vy;
    if (this.y >= FLOOR_Y) {
      const wasAir = this.vy > 2;
      this.y = FLOOR_Y;
      this.vy = 0;
      if (this.state === 'jump') {
        this.attack = null;
        this.vx = 0;
        this.setState('idle');
      } else if (this.state === 'launched') {
        this.setState('knockdown');
        this.vx *= 0.5;
        if (wasAir) world.shake(4);
      } else if (this.state === 'ko' && wasAir) {
        world.shake(5);
      }
    }
    this.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, this.x));
  }

  /** 必殺技4アーキタイプの動き */
  private updateSpecial(world: World): void {
    const sp = this.activeSp;
    const t = this.timer;
    const speed = sp.speed;
    switch (sp.type) {
      case 'projectile': {
        // 飛び道具: ためて → 発射 → 硬直
        const startup = 14;
        if (t === startup) {
          const s = this.cfg.bodyScale;
          const big = speed < 1; // 遅いタイプは弾を大きくして差別化
          world.spawnProjectile({
            x: this.x + this.facing * 42 * s,
            y: this.y - 82 * s,
            vx: this.facing * 5.6 * speed,
            w: big ? 46 : 30,
            h: big ? 34 : 22,
            dmg: Math.round(150 * sp.power * this.cfg.stats.attackPower),
            owner: this.side,
            color: sp.color,
            life: 180,
            dead: false,
          });
          world.sfx.shoot();
        }
        if (t >= startup + 24) this.setState('idle');
        break;
      }
      case 'uppercut': {
        // 昇竜: 出はじめに少し無敵 → 上昇攻撃 → 着地
        if (t === 1) this.invuln = 10;
        if (t === 4) {
          this.vy = -14.5 * speed;
          this.vx = this.facing * 2.4;
        }
        if (t > 6 && this.onGround && this.vy >= 0) {
          // 着地後の硬直
          this.vx = 0;
          if (t >= 6 + 18) this.setState('idle');
        }
        break;
      }
      case 'dash': {
        // 突進: ため → 高速突進 → 大きい硬直(ガードされると危険)
        const startup = 9;
        const dashLen = 15;
        if (t >= startup && t < startup + dashLen) {
          this.vx = this.facing * 9.5 * speed;
        } else {
          this.vx = 0;
        }
        if (t >= startup + dashLen + 22) this.setState('idle');
        break;
      }
      case 'spin': {
        // 回転: その場で多段ヒット
        const startup = 6;
        const activeLen = Math.round(42 * speed);
        if (t >= startup && t < startup + activeLen) {
          this.vx = this.facing * 1.1; // 少しだけ前に進む
          if (this.rehitTimer > 0) {
            this.rehitTimer--;
            if (this.rehitTimer === 0) this.hasHit = false; // 次の段が当たるように
          }
        } else {
          this.vx = 0;
        }
        if (t >= startup + activeLen + 14) this.setState('idle');
        break;
      }
    }
  }

  /** いま出ている攻撃判定を返す(なければnull)。バトルシーンが毎フレーム見る */
  getHit(): HitInfo | null {
    const s = this.cfg.bodyScale;
    const ap = this.cfg.stats.attackPower;
    const mk = (hb: Rect): Rect => {
      // 足元原点・右向き基準の判定を、実際の位置と向きに変換する
      const w = hb.w * s;
      const x = this.facing === 1 ? this.x + hb.x * s : this.x - hb.x * s - w;
      return { x, y: this.y + hb.y * s, w, h: hb.h * s };
    };

    if (this.state === 'attack' || (this.state === 'jump' && this.attack)) {
      const a = this.attack;
      if (!a || this.hasHit) return null;
      if (this.timer >= a.startup && this.timer < a.startup + a.active) {
        return {
          rect: mk(a.hb),
          dmg: Math.round(a.dmg * ap),
          kb: a.kb,
          hitstun: a.hitstun,
          blockstun: a.blockstun,
          launch: !!a.sweep,
          heavy: a.sfx === 'kick',
          sfx: a.sfx,
        };
      }
      return null;
    }

    if (this.state === 'special') {
      const sp = this.activeSp;
      // 多段のspinはrehitTimerでhasHitが定期的に解除される
      if (this.hasHit) return null;
      const t = this.timer;
      switch (sp.type) {
        case 'uppercut':
          if (t >= 4 && t < 22 && !this.onGround) {
            return {
              rect: mk({ x: -6, y: -142, w: 58, h: 122 }),
              dmg: Math.round(170 * sp.power * ap),
              kb: 5,
              hitstun: 30,
              blockstun: 14,
              launch: true,
              heavy: true,
              sfx: 'special',
            };
          }
          return null;
        case 'dash':
          if (t >= 9 && t < 24) {
            return {
              rect: mk({ x: 6, y: -106, w: 70, h: 86 }),
              dmg: Math.round(175 * sp.power * ap),
              kb: 9,
              hitstun: 26,
              blockstun: 18,
              launch: true,
              heavy: true,
              sfx: 'special',
            };
          }
          return null;
        case 'spin': {
          const activeLen = Math.round(42 * sp.speed);
          if (t >= 6 && t < 6 + activeLen && this.spinHits < 4) {
            return {
              rect: mk({ x: -30, y: -118, w: 110, h: 100 }),
              dmg: Math.round(52 * sp.power * ap),
              kb: 2.5,
              hitstun: 16,
              blockstun: 10,
              launch: this.spinHits >= 3, // 最後の段でふっとばす
              heavy: true,
              sfx: 'special',
            };
          }
          return null;
        }
        default:
          return null; // projectileは弾側で判定
      }
    }
    return null;
  }

  /** 攻撃が当たった直後に呼ぶ(多段技の管理) */
  onHitLanded(): void {
    this.hasHit = true;
    if (this.state === 'special' && this.activeSp.type === 'spin') {
      this.spinHits++;
      this.rehitTimer = 9; // 9フレーム後に次の段
    }
  }

  /** ガード中か判定(グラウンドで相手と反対方向を押している) */
  isGuarding(attackerX: number): { ok: boolean; low: boolean } {
    if (!this.onGround) return { ok: false, low: false };
    if (!['idle', 'walk', 'crouch', 'blockstun'].includes(this.state)) return { ok: false, low: false };
    const pad = this.lastPad;
    if (!pad) return { ok: false, low: false };
    const back = attackerX >= this.x ? pad.left : pad.right;
    if (this.state === 'blockstun') return { ok: true, low: this.stunLow }; // ガード硬直中は継続
    return { ok: back, low: pad.down };
  }

  /** ダメージを受ける */
  takeHit(hit: HitInfo, fromX: number, world: World): void {
    const dir = this.x >= fromX ? 1 : -1; // ふっとぶ方向
    this.hp = Math.max(0, this.hp - hit.dmg);
    this.flash = 6;
    this.gauge = Math.min(GAUGE_MAX, this.gauge + 4); // くらってもゲージが少したまる
    this.attack = null;
    this.crouchingAttack = false;
    if (this.hp <= 0) {
      // KO! おおきくふっとばす
      this.setState('ko');
      this.vy = -9;
      this.vx = dir * 5;
      return;
    }
    if (hit.launch || !this.onGround) {
      this.setState('launched');
      this.vy = -8.5;
      this.vx = dir * (hit.kb * 0.9 + 2);
    } else {
      this.setState('hitstun');
      this.stunDur = hit.hitstun;
      this.vx = dir * hit.kb;
    }
    world.addSpark((this.x + fromX) / 2, this.y - 80 * this.cfg.bodyScale, '#ffd45e', hit.heavy);
  }

  /** ガードした */
  takeBlock(hit: HitInfo, fromX: number, low: boolean, world: World): void {
    const dir = this.x >= fromX ? 1 : -1;
    this.setState('blockstun');
    this.stunLow = low;
    this.stunDur = hit.blockstun;
    this.vx = dir * hit.kb * 0.7;
    this.gauge = Math.min(GAUGE_MAX, this.gauge + 2);
    world.sfx.guard();
    world.addSpark(this.x + dir * -20, this.y - 70 * this.cfg.bodyScale, '#9fd8ff', false);
  }

  /** 描画に使うアニメ名・時間・進行度を決める */
  animState(): { anim: AnimName; t: number; progress: number } {
    switch (this.state) {
      case 'idle': return { anim: 'idle', t: this.animT, progress: 0 };
      case 'walk': return { anim: 'walk', t: this.animT, progress: 0 };
      case 'crouch': return { anim: 'crouch', t: this.animT, progress: 0 };
      case 'dash':
        // 前ダッシュは突進ポーズ、バックダッシュはガードっぽいのけぞり
        return { anim: this.dashDir === this.facing ? 'sp_dash' : 'guard', t: this.animT, progress: 0 };
      case 'jump': {
        if (this.attack) {
          const a = this.attack;
          return { anim: 'jumpKick', t: this.animT, progress: this.timer / (a.startup + a.active + a.recovery) };
        }
        return { anim: 'jump', t: this.animT, progress: 0 };
      }
      case 'attack': {
        const a = this.attack;
        if (!a) return { anim: 'idle', t: this.animT, progress: 0 };
        return { anim: a.anim, t: this.animT, progress: this.timer / (a.startup + a.active + a.recovery) };
      }
      case 'special': {
        const sp = this.activeSp;
        const anims: Record<string, AnimName> = {
          projectile: 'sp_projectile', uppercut: 'sp_uppercut', dash: 'sp_dash', spin: 'sp_spin',
        };
        const dur = sp.type === 'projectile' ? 38 : sp.type === 'dash' ? 46 : 60;
        return { anim: anims[sp.type], t: this.timer, progress: this.timer / dur };
      }
      case 'hitstun':
      case 'launched':
        return { anim: 'hit', t: this.animT, progress: 0 };
      case 'blockstun':
        return { anim: this.stunLow ? 'crouchGuard' : 'guard', t: this.animT, progress: 0 };
      case 'knockdown':
        return { anim: 'ko', t: this.animT, progress: 0 };
      case 'getup':
        return { anim: 'crouch', t: this.animT, progress: 0 };
      case 'ko':
        return { anim: 'ko', t: this.animT, progress: 0 };
      case 'win':
        return { anim: 'win', t: this.animT, progress: 0 };
      default:
        return { anim: 'idle', t: this.animT, progress: 0 };
    }
  }
}
