// ================================================================
// 共通ブロックリグ(ボクセル風ロボットの描画)
// 8体すべて、この1つのリグ(頭・胴体・腕2本・脚2本)を使い回す。
// characters.ts の colors / headGear / bodyScale を変えるだけで
// 見た目が変わるしくみ。
// パーツは全部 fillRect(角丸なしの四角)+輪郭線で描く。
// ================================================================

import type { RobotConfig } from './characters';

/** アニメーションの名前 */
export type AnimName =
  | 'idle' | 'walk' | 'jump' | 'crouch'
  | 'punch' | 'kick' | 'crouchPunch' | 'crouchKick' | 'jumpKick'
  | 'hit' | 'guard' | 'crouchGuard' | 'ko' | 'win'
  | 'sp_projectile' | 'sp_uppercut' | 'sp_dash' | 'sp_spin';

/** ポーズ = 各関節の角度セット(ラジアン)。0=まっすぐ下、+が前方向 */
interface Pose {
  torsoY: number; // 体全体の上下ゆれ
  lean: number;   // 胴体の前かがみ(+が前)
  head: number;   // 首のかたむき
  rsh: number; relb: number; // 右腕: 肩・ひじ
  lsh: number; lelb: number; // 左腕
  rhip: number; rknee: number; // 右脚: また・ひざ
  lhip: number; lknee: number; // 左脚
  crouch: number; // 0〜1 しゃがみぐあい
  lying: number;  // 0〜1 たおれぐあい(ダウン)
}

// 基本の構え(かるくファイティングポーズ)
const BASE: Pose = {
  torsoY: 0, lean: 0.02, head: 0,
  rsh: 0.5, relb: 1.7, lsh: -0.25, lelb: 1.3,
  rhip: 0.14, rknee: -0.25, lhip: -0.14, lknee: -0.1,
  crouch: 0, lying: 0,
};

// パーツの寸法(bodyScaleで全体を拡大縮小する)
const G = {
  thigh: 25, shin: 24, legW: 13,
  torsoW: 36, torsoH: 42,
  headS: 25,
  uarm: 20, farm: 18, armW: 10,
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function mergePose(part: Partial<Pose>): Pose {
  return { ...BASE, ...part };
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...a };
  (Object.keys(a) as (keyof Pose)[]).forEach((k) => {
    out[k] = lerp(a[k], b[k], t);
  });
  return out;
}

/** キーフレーム列 [(進行度0〜1, ポーズ), ...] を補間して現在のポーズを返す */
function kf(p: number, frames: [number, Partial<Pose>][]): Pose {
  if (p <= frames[0][0]) return mergePose(frames[0][1]);
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, a] = frames[i];
    const [t1, b] = frames[i + 1];
    if (p >= t0 && p <= t1) {
      return lerpPose(mergePose(a), mergePose(b), (p - t0) / Math.max(0.0001, t1 - t0));
    }
  }
  return mergePose(frames[frames.length - 1][1]);
}

// しゃがみの脚と腰
const CROUCH_LEGS: Partial<Pose> = {
  crouch: 1, rhip: 0.95, rknee: -1.8, lhip: -0.75, lknee: 1.4,
};

/**
 * アニメ名と時間からポーズを計算する。
 * t: 経過フレーム / progress: 攻撃モーションの進行度(0〜1)
 */
export function getPose(anim: AnimName, t: number, progress: number): Pose {
  const p = Math.min(1, Math.max(0, progress));
  switch (anim) {
    case 'idle': {
      // 待機: ゆっくり上下にゆれる
      const bob = Math.sin(t * 0.08);
      return mergePose({ torsoY: bob * 2.2, rsh: 0.5 + bob * 0.05, lsh: -0.25 - bob * 0.05 });
    }
    case 'walk': {
      // 歩行: 脚を前後にふる。腕は逆にふる
      const ph = t * 0.18;
      const sw = Math.sin(ph) * 0.55;
      return mergePose({
        torsoY: Math.abs(Math.cos(ph)) * 2.5,
        rhip: sw, lhip: -sw,
        rknee: -0.3 + 0.25 * Math.cos(ph), lknee: -0.3 - 0.25 * Math.cos(ph),
        rsh: 0.45 - sw * 0.45, lsh: -0.25 + sw * 0.45,
      });
    }
    case 'jump':
      // ジャンプ: 脚をたたむ
      return mergePose({
        rhip: 0.55, rknee: -1.3, lhip: -0.4, lknee: -0.6,
        rsh: -0.5, relb: 1.9, lsh: 0.45, lelb: 1.1, lean: 0.06,
      });
    case 'crouch':
      return mergePose({ ...CROUCH_LEGS, rsh: 0.55, relb: 1.8, lsh: -0.3, lelb: 1.5 });
    case 'punch':
      // 立ちパンチ: ひきしぼって → まっすぐつき出す
      return kf(p, [
        [0, {}],
        [0.22, { rsh: -0.45, relb: 2.3, lean: -0.08 }],
        [0.42, { rsh: 1.55, relb: 0.05, lean: 0.24, lsh: -0.55, lelb: 1.7 }],
        [0.62, { rsh: 1.55, relb: 0.05, lean: 0.24, lsh: -0.55, lelb: 1.7 }],
        [1, {}],
      ]);
    case 'kick':
      // 立ちキック: 前げり
      return kf(p, [
        [0, {}],
        [0.28, { rhip: -0.5, rknee: -1.6, lean: -0.16 }],
        [0.5, { rhip: 1.5, rknee: -0.05, lean: -0.3, rsh: -0.6, lsh: 0.6, lknee: -0.15 }],
        [0.68, { rhip: 1.5, rknee: -0.05, lean: -0.3, rsh: -0.6, lsh: 0.6, lknee: -0.15 }],
        [1, {}],
      ]);
    case 'crouchPunch':
      return kf(p, [
        [0, CROUCH_LEGS],
        [0.25, { ...CROUCH_LEGS, rsh: -0.3, relb: 2.2 }],
        [0.45, { ...CROUCH_LEGS, rsh: 1.5, relb: 0.05, lean: 0.2 }],
        [0.65, { ...CROUCH_LEGS, rsh: 1.5, relb: 0.05, lean: 0.2 }],
        [1, CROUCH_LEGS],
      ]);
    case 'crouchKick':
      // しゃがみキック: 足ばらい
      return kf(p, [
        [0, CROUCH_LEGS],
        [0.3, { ...CROUCH_LEGS, rhip: 0.2, rknee: -2.2, lean: 0.1 }],
        [0.5, { ...CROUCH_LEGS, rhip: 1.35, rknee: -0.05, lean: 0.32, rsh: -0.5 }],
        [0.7, { ...CROUCH_LEGS, rhip: 1.35, rknee: -0.05, lean: 0.32, rsh: -0.5 }],
        [1, CROUCH_LEGS],
      ]);
    case 'jumpKick':
      return mergePose({
        rhip: 1.2, rknee: -0.25, lhip: -0.5, lknee: -1.3,
        lean: 0.18, rsh: -0.45, relb: 1.6, lsh: 0.5,
      });
    case 'hit':
      // やられ: のけぞる
      return mergePose({
        lean: -0.36, head: -0.3, torsoY: 1.5,
        rsh: -0.9, relb: 0.7, lsh: -0.7, lelb: 0.6,
        rhip: 0.35, lhip: -0.3, rknee: -0.4,
      });
    case 'guard':
      // ガード: 腕を体の前でクロス
      return mergePose({
        lean: -0.08, rsh: 0.95, relb: 2.1, lsh: 0.7, lelb: 1.9, head: -0.06,
      });
    case 'crouchGuard':
      return mergePose({
        ...CROUCH_LEGS, lean: -0.06, rsh: 0.95, relb: 2.1, lsh: 0.7, lelb: 1.9,
      });
    case 'ko':
      // ダウン: あおむけにたおれる(lyingは呼び出し側が徐々に1へ)
      return mergePose({ lying: 1, rsh: -0.5, lsh: -0.4, rhip: 0.15, lhip: -0.1, relb: 0.3, lelb: 0.3 });
    case 'win': {
      // 勝利ポーズ: 両手を上げてバンザイジャンプ
      const b = Math.abs(Math.sin(t * 0.12));
      return mergePose({
        torsoY: -b * 7,
        rsh: 2.9, relb: -0.15 + b * 0.15, lsh: -2.9, lelb: 0.15 - b * 0.15,
        rhip: 0.1, lhip: -0.1, head: 0.08,
      });
    }
    case 'sp_projectile':
      // 飛び道具: 両手を前につき出す
      return kf(p, [
        [0, {}],
        [0.25, { rsh: -0.7, relb: 1.6, lsh: -0.9, lelb: 1.5, lean: -0.14 }],
        [0.45, { rsh: 1.45, relb: 0.12, lsh: 1.3, lelb: 0.2, lean: 0.22 }],
        [0.75, { rsh: 1.45, relb: 0.12, lsh: 1.3, lelb: 0.2, lean: 0.22 }],
        [1, {}],
      ]);
    case 'sp_uppercut':
      // 昇竜: こぶしを天につき上げる
      return mergePose({
        rsh: 3.0, relb: 0.05, lsh: -0.6, lelb: 1.8,
        lean: -0.1, rhip: 0.6, rknee: -1.2, lhip: -0.5, lknee: -0.8,
      });
    case 'sp_dash':
      // 突進: 前のめりでつっこむ
      return mergePose({
        lean: 0.55, rsh: 1.5, relb: 0.1, lsh: -0.8, lelb: 1.2,
        rhip: -0.8, rknee: -0.9, lhip: 0.55, lknee: -0.2, head: -0.1,
      });
    case 'sp_spin':
      // 回転: 両腕を水平にひろげる(横方向の回転は描画側で表現)
      return mergePose({
        rsh: 1.57, relb: 0, lsh: -1.57, lelb: 0,
        rhip: 0.35, lhip: -0.35, torsoY: -2,
      });
    default:
      return mergePose({});
  }
}

/** 色を暗くする(奥側の腕・脚を立体的に見せるため) */
function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f);
  const g = Math.round(((n >> 8) & 255) * f);
  const b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

/** 輪郭線つきの四角を描く(リグの基本部品) */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#15151c';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

/** 腕・脚(2関節の四角パーツ)を描く。a1=つけ根の角度 a2=関節の曲げ */
function limb(
  ctx: CanvasRenderingContext2D,
  jx: number, jy: number, a1: number, a2: number,
  len1: number, len2: number, w: number,
  c1: string, c2: string, tipColor?: string,
): void {
  ctx.save();
  ctx.translate(jx, jy);
  ctx.rotate(-a1); // 角度0=まっすぐ下 / +が前方向 になるように回す
  box(ctx, -w / 2, -2, w, len1 + 4, c1);
  ctx.translate(0, len1);
  ctx.rotate(-a2);
  box(ctx, -w / 2, -2, w, len2 + 4, c2);
  if (tipColor) box(ctx, -w / 2 - 1, len2 - 1, w + 2, w * 0.9, tipColor); // こぶし/足先
  ctx.restore();
}

/** 頭部装飾(headGear)を描く。ここでキャラの個性を出す */
function drawHeadGear(ctx: CanvasRenderingContext2D, cfg: RobotConfig, hs: number, t: number, flash: boolean): void {
  // 髪・飾りの色: look.gear があればそれを使う(黒髪・金髪などを再現)
  const gearDefault = ['ponytail', 'dreads'].includes(cfg.headGear) ? cfg.colors.secondary : cfg.colors.accent;
  const gc = flash ? '#fff' : cfg.look?.gear ?? gearDefault;
  const c2 = gc;
  const ac = gc;
  switch (cfg.headGear) {
    case 'mohawk': // モヒカン(ガンテツ)
      box(ctx, -3, -hs - 13, 7, 14, ac);
      box(ctx, -8, -hs - 8, 6, 9, ac);
      break;
    case 'ponytail': { // 後ろがみ(シノビィ)
      const sway = Math.sin(t * 0.1) * 2;
      box(ctx, -hs / 2 - 8 + sway, -hs + 6, 8, 24, c2);
      box(ctx, -hs / 2 - 3, -hs + 2, 6, 7, ac); // むすび目
      break;
    }
    case 'mask_wing': // マスクの羽(マスクスター)
      ctx.save();
      ctx.rotate(0.5);
      box(ctx, hs / 2 - 4, -hs - 10, 6, 14, ac);
      ctx.restore();
      ctx.save();
      ctx.rotate(-0.5);
      box(ctx, -hs / 2 - 2, -hs - 10, 6, 14, ac);
      ctx.restore();
      break;
    case 'techvisor': // ハイテクバイザー(ブルービット)
      box(ctx, -hs / 2 - 2, -hs * 0.72, hs + 4, 9, ac);
      break;
    case 'spiky': // トゲトゲヘアー(ボルトン)
      box(ctx, -9, -hs - 9, 6, 10, ac);
      box(ctx, -1, -hs - 12, 6, 13, ac);
      box(ctx, 7, -hs - 8, 6, 9, ac);
      break;
    case 'bald': // つるつるあたま(ゼンマル): 光る点だけ
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillRect(hs * 0.1, -hs * 0.9, 4, 4);
      break;
    case 'dreads': { // ドレッドヘアー(リズミー)
      const sw = Math.sin(t * 0.12) * 1.5;
      box(ctx, -hs / 2 - 6 + sw, -hs + 4, 5, 18, c2);
      box(ctx, -hs / 2 - 1, -hs - 4, 5, 14, c2);
      box(ctx, hs / 2 - 4, -hs - 4, 5, 14, c2);
      box(ctx, hs / 2 + 1 - sw, -hs + 4, 5, 18, c2);
      break;
    }
    case 'headband': { // ハチマキ(ブレイズ)
      box(ctx, -hs / 2 - 2, -hs * 0.85, hs + 4, 7, ac);
      const fl = Math.sin(t * 0.14) * 3;
      box(ctx, -hs / 2 - 16, -hs * 0.85 + fl, 15, 5, ac); // なびくリボン
      box(ctx, -hs / 2 - 26, -hs * 0.8 - fl, 12, 5, ac);
      break;
    }
  }
}

export interface DrawRobotOpts {
  flash?: boolean; // ダメージ点滅(真っ白にする)
  alpha?: number;
}

/**
 * ロボットを描く。呼び出し側で ctx.translate(足元のx, y) してから呼ぶこと。
 * facing: 1=右向き -1=左向き
 */
export function drawRobot(
  ctx: CanvasRenderingContext2D,
  cfg: RobotConfig,
  anim: AnimName,
  t: number,
  progress: number,
  facing: 1 | -1,
  opts: DrawRobotOpts = {},
): void {
  const pose = getPose(anim, t, progress);
  const s = cfg.bodyScale;
  const flash = !!opts.flash;

  // パーツごとの色を決める。look で上書きがあればそれを使い、
  // なければ colors の基本マッピング(胴体・脚=primary、うで=secondary)
  const look = cfg.look ?? {};
  const pick = (over: string | undefined, fallback: string): string =>
    flash ? '#ffffff' : over ?? fallback;
  const cTorso = pick(look.torso, cfg.colors.primary);
  const cLegs = pick(look.legs, cfg.colors.primary);
  const cArms = pick(look.arms, cfg.colors.secondary);
  const cFists = pick(look.fists, cfg.colors.skin);
  const cFeet = pick(look.feet, cfg.colors.secondary);
  const cBelt = pick(look.belt, cfg.colors.accent);
  const cSkin = flash ? '#ffffff' : cfg.colors.skin;
  const cAcc = flash ? '#ffffff' : cfg.colors.accent;
  const dark = 0.62; // 奥側パーツの暗さ

  ctx.save();
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  ctx.scale(facing, 1); // 左向きは左右反転で表現

  // 回転必殺技: 横方向のスケールで「回っている感」を出す
  if (anim === 'sp_spin') {
    const c = Math.cos(t * 0.45);
    ctx.scale(Math.sign(c) * Math.max(0.25, Math.abs(c)) || 0.25, 1);
  }

  // ダウン: 足元を軸に後ろへたおす
  if (pose.lying > 0) {
    ctx.translate(pose.lying * 10, -pose.lying * 4);
    ctx.rotate(-pose.lying * 1.38);
  }

  ctx.scale(s, s);

  // しゃがむと腰の位置が下がる
  const hipY = -(G.thigh + G.shin) * (1 - 0.42 * pose.crouch) + pose.torsoY;
  const th = G.torsoH;
  const shY = hipY - th + 8; // 肩の高さ

  // 胴体と同じ傾きの座標系で腕を描くためのヘルパー
  const armLayer = (side: -1 | 1): void => {
    ctx.save();
    ctx.translate(0, hipY);
    ctx.rotate(pose.lean);
    const a1 = side === 1 ? pose.rsh : pose.lsh;
    const a2 = side === 1 ? pose.relb : pose.lelb;
    const f = side === 1 ? 1 : dark;
    limb(
      ctx, side * 6, shY - hipY, a1, a2,
      G.uarm, G.farm, G.armW,
      side === 1 ? cArms : shade(cArms, f),
      side === 1 ? cArms : shade(cArms, f),
      side === 1 ? cFists : shade(cFists, f),
    );
    ctx.restore();
  };

  // --- 描画順: 奥の腕 → 奥の脚 → 手前の脚 → 胴体+頭 → 手前の腕 ---
  armLayer(-1);

  // 脚(奥・手前)
  limb(ctx, -5, hipY, pose.lhip, pose.lknee, G.thigh, G.shin, G.legW, shade(cLegs, dark), shade(cLegs, dark), shade(cFeet, dark));
  limb(ctx, 5, hipY, pose.rhip, pose.rknee, G.thigh, G.shin, G.legW, cLegs, cLegs, cFeet);

  // 胴体+頭
  ctx.save();
  ctx.translate(0, hipY);
  ctx.rotate(pose.lean);
  box(ctx, -G.torsoW / 2, -th, G.torsoW, th + 4, cTorso);
  // 胸のライト(アクセント色)
  ctx.fillStyle = cAcc;
  ctx.fillRect(-4, -th + 12, 9, 9);
  ctx.strokeStyle = '#15151c';
  ctx.strokeRect(-4, -th + 12, 9, 9);
  // ベルト(腰まわりの差し色。衣装っぽさを出す)
  box(ctx, -G.torsoW / 2 - 1, -8, G.torsoW + 2, 8, cBelt);

  // 頭(首のかたむきつき)
  ctx.save();
  ctx.translate(0, -th);
  ctx.rotate(pose.head);
  const hs = G.headS;
  box(ctx, -hs / 2, -hs, hs, hs, cSkin);
  // 口もとのマスク(忍者など): 顔の下半分をおおう
  if (look.faceMask) {
    box(ctx, -hs / 2 + 1, -hs * 0.44, hs - 2, hs * 0.44 - 1, flash ? '#ffffff' : look.faceMask);
  }
  // 目(アクセント色で光る)。バイザーのキャラは drawHeadGear 側で覆う
  if (cfg.headGear !== 'techvisor') {
    ctx.save();
    ctx.shadowColor = cAcc;
    ctx.shadowBlur = 6;
    ctx.fillStyle = cAcc;
    ctx.fillRect(hs * 0.08, -hs * 0.68, hs * 0.3, 5);
    ctx.restore();
  }
  drawHeadGear(ctx, cfg, hs, t, flash);
  ctx.restore(); // 頭おわり
  ctx.restore(); // 胴体おわり

  armLayer(1);

  ctx.restore();
}
