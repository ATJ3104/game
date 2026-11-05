import { describe, expect, it } from "vitest";
import {
  evaluateSession,
  pickFromPrevLevel,
  shouldPromote,
  shouldReviewMix,
  type AttemptLite,
  type SessionEval,
} from "@/domain/progression";
import { DEFAULT_SETTINGS, parseSettings } from "@/domain/settings";

const s = DEFAULT_SETTINGS;
const E = (correct: number, total: number, avgMs: number | null = 3000): SessionEval => ({ total, correct, avgMs });
const A = (isCorrect: boolean, responseMs = 3000, extra: Partial<AttemptLite> = {}): AttemptLite => ({
  isCorrect,
  responseMs,
  isGuess: false,
  isRetry: false,
  fromPrevLevel: false,
  ...extra,
});

describe("1回の学習の成績", () => {
  it("間違い直し・当て推量・前レベルの問題は除く", () => {
    const e = evaluateSession([
      A(true, 2000),
      A(false, 4000),
      A(true, 1000, { isRetry: true }),
      A(true, 300, { isGuess: true }),
      A(false, 5000, { fromPrevLevel: true }),
    ]);
    expect(e).toEqual({ total: 2, correct: 1, avgMs: 3000 });
  });
  it("回答がなければ平均は null", () => {
    expect(evaluateSession([])).toEqual({ total: 0, correct: 0, avgMs: null });
  });
});

describe("進級", () => {
  const target = 4000;
  it("直近3回すべて 90%以上・目標時間以内なら進級", () => {
    expect(shouldPromote([E(9, 10), E(10, 10), E(18, 20)], target, s)).toBe(true);
  });
  it("2回しかなければまだ", () => {
    expect(shouldPromote([E(10, 10), E(10, 10)], target, s)).toBe(false);
  });
  it("1回でも 90%未満なら進級しない", () => {
    expect(shouldPromote([E(10, 10), E(8, 10), E(10, 10)], target, s)).toBe(false);
  });
  it("平均時間が目標を超えたら進級しない", () => {
    expect(shouldPromote([E(10, 10), E(10, 10, 4001), E(10, 10)], target, s)).toBe(false);
  });
  it("ちょうど 90%・ちょうど目標時間は進級", () => {
    expect(shouldPromote([E(9, 10, 4000), E(9, 10, 4000), E(9, 10, 4000)], target, s)).toBe(true);
  });
  it("見るのは直近3回だけ（それより前の悪い回は関係ない）", () => {
    expect(shouldPromote([E(10, 10), E(10, 10), E(10, 10), E(1, 10)], target, s)).toBe(true);
  });
  it("回答数が少なすぎる回は判定に使わない（当て推量ばかりの回など）", () => {
    expect(shouldPromote([E(2, 2), E(10, 10), E(10, 10)], target, s)).toBe(false);
    expect(shouldPromote([E(2, 2), E(10, 10), E(10, 10), E(10, 10)], target, s)).toBe(true);
  });
  it("設定で回数・正答率を変えられる", () => {
    const custom = parseSettings(JSON.stringify({ promoteSessions: 2, promoteAccuracy: 0.8 }));
    expect(shouldPromote([E(8, 10), E(8, 10)], target, custom)).toBe(true);
  });
});

describe("復習", () => {
  it("直近2回続けて 70%未満なら復習", () => {
    expect(shouldReviewMix([E(6, 10), E(5, 10)], s)).toBe(true);
  });
  it("1回だけ低いなら復習しない", () => {
    expect(shouldReviewMix([E(6, 10), E(8, 10)], s)).toBe(false);
    expect(shouldReviewMix([E(6, 10)], s)).toBe(false);
  });
  it("ちょうど 70% は復習にならない", () => {
    expect(shouldReviewMix([E(7, 10), E(6, 10)], s)).toBe(false);
  });
  it("復習中に正答率が戻れば解除", () => {
    expect(shouldReviewMix([E(9, 10), E(5, 10), E(5, 10)], s)).toBe(false);
  });
  it("前のレベルからは約3割（乱数がしきい値未満のとき）", () => {
    expect(pickFromPrevLevel(true, true, 0.3, 0.29)).toBe(true);
    expect(pickFromPrevLevel(true, true, 0.3, 0.3)).toBe(false);
    expect(pickFromPrevLevel(false, true, 0.3, 0.1)).toBe(false);
    expect(pickFromPrevLevel(true, false, 0.3, 0.1)).toBe(false); // M01 には前がない
  });
});

describe("設定の読み込み", () => {
  it("不正な値は初期値に戻す", () => {
    const p = parseSettings(JSON.stringify({ dayBoundaryHour: 99, promoteAccuracy: "x" }));
    expect(p.dayBoundaryHour).toBe(3);
    expect(p.promoteAccuracy).toBe(0.9);
    expect(parseSettings("not json")).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
  });
});
