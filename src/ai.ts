// ================================================================
// CPU AI(コンピューターの思考ルーチン)
// 「距離に応じた行動テーブル + ランダムの重みづけ」のステートマシン。
// 人間には不可能なフレーム単位の完全反応はせず、必ず反応遅延を入れる。
// 難易度3段階: よわい / ふつう / つよい
// ================================================================

import { emptyPad, type PadState } from './input';
import { GAUGE_MAX, type Fighter } from './fight';

// ---- 難易度ごとの設定データ(数字を変えるだけで強さが変わる) ----
interface LevelCfg {
  decide: number; // 何フレームごとに次の行動を考えるか(小さいほど機敏)
  guard: number; // 攻撃を見てからガードする確率
  react: number; // 反応遅延(フレーム)。0にはしない=人間らしさ
  special: number; // ゲージ満タン時に必殺技を使いたがる度合い
  aggr: number; // 攻撃的さ(前に出る度合い)
  grace: number; // ラウンド開始後、攻撃をがまんするフレーム数
  atkCooldown: number; // 一度攻撃したあと、次の攻撃までの最短フレーム
}

export const LEVEL_NAMES = ['EASY (よわい)', 'NORMAL (ふつう)', 'HARD (つよい)'];

const LEVELS: LevelCfg[] = [
  // EASY: 開始2秒は攻撃せず、連続攻撃もひかえる
  { decide: 52, guard: 0.08, react: 24, special: 0.15, aggr: 0.45, grace: 120, atkCooldown: 80 },
  { decide: 32, guard: 0.4, react: 14, special: 0.5, aggr: 0.6, grace: 30, atkCooldown: 20 },
  // HARD: 高反応だが反応遅延は必ず残す(入力読みはしない)
  { decide: 19, guard: 0.8, react: 8, special: 0.95, aggr: 0.75, grace: 0, atkCooldown: 0 },
];

const ATTACK_PLANS: Plan[] = ['punch', 'kick', 'sweep', 'special', 'jumpIn', 'antiAir'];

type Plan = 'wait' | 'approach' | 'retreat' | 'jumpIn' | 'punch' | 'kick' | 'sweep' | 'guard' | 'special' | 'antiAir';

export class CpuBrain {
  private plan: Plan = 'wait';
  private planT = 0;
  private planAge = 0; // いまのプランを始めてからのフレーム数
  private planNew = false;
  private reactT = -1; // 相手の攻撃への反応カウントダウン
  private guardHold = 0;
  private guardLow = false;
  private spLow = false; // 必殺技②(しゃがみ版)を使うか
  private frames = 0; // ラウンドが始まってからのフレーム数
  private lastAttackAt = -9999; // さいごに攻撃プランを選んだフレーム
  private L: LevelCfg;

  constructor(level: 0 | 1 | 2) {
    this.L = LEVELS[level];
  }

  /** ラウンド開始時に呼ぶ(開始直後のがまん時間をリセット) */
  resetRound(): void {
    this.frames = 0;
    this.lastAttackAt = -9999;
    this.plan = 'wait';
    this.planT = 0;
    this.reactT = -1;
    this.guardHold = 0;
  }

  /** 重みつきランダムで行動を1つ選ぶ */
  private pick(weights: [Plan, number][]): Plan {
    const total = weights.reduce((s, w) => s + w[1], 0);
    let r = Math.random() * total;
    for (const [p, w] of weights) {
      r -= w;
      if (r <= 0) return p;
    }
    return 'wait';
  }

  update(self: Fighter, foe: Fighter): PadState {
    const pad = emptyPad();
    const L = this.L;
    this.frames++;
    // 攻撃していい状態か(開始直後のがまん・連続攻撃のクールダウン)
    const attackOK =
      this.frames >= L.grace && this.frames - this.lastAttackAt >= L.atkCooldown;
    const dist = Math.abs(foe.x - self.x);
    const fwd = foe.x > self.x; // 相手は右にいるか
    const gaugeFull = self.gauge >= GAUGE_MAX;
    const spType = self.cfg.special.type;

    // ---- 反応ガード: 相手の攻撃を見てから、遅延つきで反応する ----
    const foeAttacking = foe.state === 'attack' || foe.state === 'special';
    if (foeAttacking && dist < 220 && self.onGround) {
      if (this.reactT < 0) this.reactT = L.react; // 気づいた!(でもすぐは動けない)
      else if (this.reactT > 0) this.reactT--;
      else if (this.guardHold <= 0 && Math.random() < L.guard) {
        this.guardHold = 30;
        this.guardLow = Math.random() < 0.5;
      }
    } else if (!foeAttacking) {
      this.reactT = -1;
    }

    if (this.guardHold > 0) {
      // ガード: 相手と反対方向に入れる
      this.guardHold--;
      if (fwd) pad.left = true;
      else pad.right = true;
      if (this.guardLow) pad.down = true;
      return pad;
    }

    // ---- 対空: 相手が飛びこんできたら迎えうつ(強いほど反応する) ----
    if (attackOK && !foe.onGround && dist < 190 && self.onGround && Math.random() < L.guard * 0.1) {
      this.plan = 'antiAir';
      this.planT = 12;
      this.planAge = 0;
      this.planNew = true;
    }

    // ---- 定期的に次の行動を考える ----
    this.planT--;
    if (this.planT <= 0) {
      const canAct = ['idle', 'walk', 'crouch'].includes(self.state);
      if (canAct) {
        const spWeight = gaugeFull ? L.special * 5 : 0;
        let table: [Plan, number][];
        if (dist > 280) {
          // 遠距離: 近づく or 飛び道具
          table = [
            ['approach', 5 + L.aggr * 4],
            ['jumpIn', 2],
            ['special', spType === 'projectile' ? spWeight * 1.5 : 0],
            ['wait', 2],
          ];
        } else if (dist > 130) {
          // 中距離: けん制や飛びこみ
          table = [
            ['approach', 3 + L.aggr * 2],
            ['kick', 2.5],
            ['jumpIn', 2],
            ['sweep', 1.5],
            ['retreat', 1.5],
            ['special', spType === 'projectile' || spType === 'dash' ? spWeight : spWeight * 0.4],
            ['wait', 1.5],
          ];
        } else {
          // 近距離: なぐりあい
          table = [
            ['punch', 4],
            ['kick', 3],
            ['sweep', 2.5],
            ['retreat', 1.6],
            ['guard', 1 + L.guard * 2],
            ['special', spType === 'projectile' ? spWeight * 0.3 : spWeight],
            ['wait', 1],
          ];
        }
        // 攻撃してはいけない時間帯は、攻撃系のプランをテーブルから外す
        if (!attackOK) {
          table = table.filter(([p]) => !ATTACK_PLANS.includes(p));
          if (table.length === 0) table = [['wait', 1]];
        }
        this.plan = this.pick(table);
        this.planNew = true;
        this.planAge = 0;
        this.planT = L.decide + Math.floor(Math.random() * 12);
        if (ATTACK_PLANS.includes(this.plan)) this.lastAttackAt = this.frames;
        if (this.plan === 'special') this.spLow = Math.random() < 0.5; // ①と②を半々で使う
      } else {
        this.planT = 6; // 動けない間はちょっと待つ
      }
    }

    // ---- 選んだ行動を入力に変換する ----
    const isNew = this.planNew;
    this.planNew = false;
    this.planAge++;
    switch (this.plan) {
      case 'approach':
        if (fwd) pad.right = true;
        else pad.left = true;
        break;
      case 'retreat':
        if (fwd) pad.left = true;
        else pad.right = true;
        break;
      case 'jumpIn':
        // 上入力は最初だけ(押しっぱなしだと着地後すぐまた跳んでしまう)
        pad.up = this.planAge <= 3;
        if (fwd) pad.right = true;
        else pad.left = true;
        // 飛びこみ中にキックを出す
        if (!self.onGround && self.vy > -3 && !self.attack) {
          pad.kick = true;
          pad.kickP = true;
        }
        break;
      case 'punch':
      case 'antiAir':
        pad.punch = true;
        pad.punchP = isNew;
        break;
      case 'kick':
        pad.kick = true;
        pad.kickP = isNew;
        break;
      case 'sweep':
        pad.down = true;
        pad.kick = true;
        pad.kickP = isNew && self.state === 'crouch'; // しゃがんでからける
        if (isNew && self.state !== 'crouch') this.planNew = true; // 次フレームでキック
        break;
      case 'guard':
        if (fwd) pad.left = true;
        else pad.right = true;
        pad.down = Math.random() < 0.5;
        break;
      case 'special':
        pad.special = true;
        if (this.spLow) {
          // しゃがんでから押すと必殺技②になる
          pad.down = true;
          pad.specialP = this.planAge === 4;
        } else {
          pad.specialP = isNew;
        }
        break;
      case 'wait':
        break;
    }
    return pad;
  }
}
