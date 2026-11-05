import { describe, expect, it } from "vitest";
import { clampActiveMs, clampResponseMs, isGuess, nextStatus, pendingRetries } from "@/domain/session";

const now = new Date("2026-11-05T10:00:10Z");

describe("時間の加算", () => {
  it("報告された時間を、前回の報告からの経過時間（＋余裕2秒）で切り詰める", () => {
    expect(clampActiveMs(5000, "2026-11-05T10:00:00Z", now)).toBe(5000);
    expect(clampActiveMs(60000, "2026-11-05T10:00:00Z", now)).toBe(12000);
    expect(clampActiveMs(-1, "2026-11-05T10:00:00Z", now)).toBe(0);
    expect(clampActiveMs("x", "2026-11-05T10:00:00Z", now)).toBe(0);
    expect(clampActiveMs(5000, null, now)).toBe(0);
  });
  it("回答時間は表示からの経過時間を上限に", () => {
    expect(clampResponseMs(3000, "2026-11-05T10:00:05Z", now)).toBe(3000);
    expect(clampResponseMs(30000, "2026-11-05T10:00:05Z", now)).toBe(6000);
    expect(clampResponseMs(undefined, "2026-11-05T10:00:05Z", now)).toBe(5000);
  });
  it("当て推量：しきい値未満", () => {
    expect(isGuess(999, 1000)).toBe(true);
    expect(isGuess(1000, 1000)).toBe(false);
  });
});

describe("次の段階", () => {
  it("目標時間前は学習を続ける", () => {
    expect(nextStatus({ status: "studying", activeSeconds: 599, targetSeconds: 600, pendingRetries: 3 })).toBe("studying");
  });
  it("目標時間に達したら間違い直しへ、なければ完了", () => {
    expect(nextStatus({ status: "studying", activeSeconds: 600, targetSeconds: 600, pendingRetries: 2 })).toBe("retry");
    expect(nextStatus({ status: "studying", activeSeconds: 601, targetSeconds: 600, pendingRetries: 0 })).toBe("done");
  });
  it("間違い直しは全部正解するまで続く", () => {
    expect(nextStatus({ status: "retry", activeSeconds: 900, targetSeconds: 600, pendingRetries: 1 })).toBe("retry");
    expect(nextStatus({ status: "retry", activeSeconds: 900, targetSeconds: 600, pendingRetries: 0 })).toBe("done");
  });
});

describe("間違い直しの順番", () => {
  const originals = [
    { id: "a", createdAt: "2026-11-05T10:00:01Z" },
    { id: "b", createdAt: "2026-11-05T10:00:02Z" },
    { id: "c", createdAt: "2026-11-05T10:00:03Z" },
  ];
  it("最初は間違えた順", () => {
    expect(pendingRetries(originals, [])).toEqual(["a", "b", "c"]);
  });
  it("直せたものは外れ、また間違えたものは後ろへ回る", () => {
    expect(
      pendingRetries(originals, [
        { retryOf: "a", isCorrect: false, createdAt: "2026-11-05T10:05:00Z" },
        { retryOf: "b", isCorrect: true, createdAt: "2026-11-05T10:05:01Z" },
      ]),
    ).toEqual(["c", "a"]);
  });
  it("一度間違えても、あとで正解すれば完了", () => {
    expect(
      pendingRetries(
        [originals[0]!],
        [
          { retryOf: "a", isCorrect: false, createdAt: "2026-11-05T10:05:00Z" },
          { retryOf: "a", isCorrect: true, createdAt: "2026-11-05T10:06:00Z" },
        ],
      ),
    ).toEqual([]);
  });
});
