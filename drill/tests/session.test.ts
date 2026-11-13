import { describe, expect, it } from "vitest";
import { clampActiveMs, clampResponseMs, countsTowardQuota, isGuess, nextStatus, pendingRetries, questionQuota } from "@/domain/session";

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

describe("次の段階（問題数で決まる）", () => {
  it("決まった問題数に届くまでは学習を続ける（時間がたつだけでは終わらない）", () => {
    expect(nextStatus({ status: "studying", answered: 39, targetQuestions: 40, pendingRetries: 3 })).toBe("studying");
    expect(nextStatus({ status: "studying", answered: 0, targetQuestions: 40, pendingRetries: 0 })).toBe("studying");
  });
  it("問題数に届いたら間違い直しへ、なければ完了", () => {
    expect(nextStatus({ status: "studying", answered: 40, targetQuestions: 40, pendingRetries: 2 })).toBe("retry");
    expect(nextStatus({ status: "studying", answered: 41, targetQuestions: 40, pendingRetries: 0 })).toBe("done");
  });
  it("間違い直しは全部正解するまで続く", () => {
    expect(nextStatus({ status: "retry", answered: 40, targetQuestions: 40, pendingRetries: 1 })).toBe("retry");
    expect(nextStatus({ status: "retry", answered: 40, targetQuestions: 40, pendingRetries: 0 })).toBe("done");
  });
});

describe("問題数", () => {
  it("目標時間とレベルの目標解答時間から決まる", () => {
    expect(questionQuota(600, 4000)).toBe(75); // 10分・10までのたし算（4秒）
    expect(questionQuota(600, 3000)).toBe(92); // 九九（3秒）
    expect(questionQuota(600, 30000)).toBe(13); // 2けた×2けた（30秒）
    expect(questionQuota(600, 7000)).toBe(48); // 漢字（7秒）
    expect(questionQuota(300, 4000)).toBe(38); // 5分なら半分
    expect(questionQuota(1200, 4000)).toBe(150); // 20分なら2倍
  });
  it("少なすぎ・多すぎにはしない", () => {
    expect(questionQuota(60, 30000)).toBe(5);
    expect(questionQuota(7200, 3000)).toBe(200);
  });
  it("数えるのは、間違い直し以外の回答。速すぎる まちがいは数えない", () => {
    const a = { isRetry: false, isCorrect: true, isGuess: false };
    expect(countsTowardQuota(a)).toBe(true);
    expect(countsTowardQuota({ ...a, isCorrect: false })).toBe(true); // ふつうのまちがいは数える（あとで直す）
    expect(countsTowardQuota({ ...a, isGuess: true })).toBe(true); // 速くても正解なら数える
    expect(countsTowardQuota({ ...a, isCorrect: false, isGuess: true })).toBe(false); // でたらめ連打
    expect(countsTowardQuota({ ...a, isRetry: true })).toBe(false);
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
