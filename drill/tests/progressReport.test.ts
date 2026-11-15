import { describe, expect, it } from "vitest";
import { promotionProgress, questionText, subjectDayReport, type AttemptRow } from "@/domain/progressReport";
import { generateQuestion } from "@/domain/math/generators";
import { seededRng } from "@/domain/math/rng";
import { DEFAULT_SETTINGS } from "@/domain/settings";
import type { MathQuestion } from "@/domain/math/question";

const rng = seededRng(5);
const add = generateQuestion("M01", rng);
const kuku = generateQuestion("M09", rng);
const row = (id: string, q: MathQuestion, isCorrect: boolean, extra: Partial<AttemptRow> = {}): AttemptRow => ({
  id, q, answer: "9", correctAnswer: "8", isCorrect, isRetry: false, isGuess: false, retryOf: null, ...extra,
});

describe("その日の教科のまとめ", () => {
  it("解いた数・正解・まちがい・直した数・内訳", () => {
    const r = subjectDayReport([
      row("1", add, true),
      row("2", add, false),
      row("3", kuku, false, { isGuess: true }),
      row("4", kuku, true),
      row("5", add, true, { isRetry: true, retryOf: "2" }), // 2 を直した
      row("6", kuku, false, { isRetry: true, retryOf: "3" }), // 3 はまだ
    ]);
    expect(r).toMatchObject({ answered: 4, correct: 2, wrong: 2, fixed: 1, guesses: 1 });
    expect(r.categories.map((c) => [c.name, c.answered, c.correct])).toEqual([
      ["たし算", 2, 1],
      [expect.stringMatching(/の段$/), 2, 1],
    ]);
    expect(r.mistakes.map((m) => m.fixed)).toEqual([true, false]);
    expect(r.mistakes[0]!.text).toBe(questionText(add));
  });
  it("何もしていなければ 0", () => {
    expect(subjectDayReport([])).toMatchObject({ answered: 0, correct: 0, wrong: 0, categories: [], mistakes: [] });
  });
  it("問題の文字（算数・漢字・英語）", () => {
    expect(questionText(add)).toMatch(/^\d+ \+ \d+ =$/);
    const kanji: MathQuestion = { level: "K10", tokens: [], kind: "choice", meta: {}, rich: [{ t: "text", v: "つくえの " }, { t: "target", v: "下", rt: "した" }, { t: "text", v: "に" }] };
    expect(questionText(kanji)).toBe("つくえの ［下］に");
    expect(questionText({ level: "E10", tokens: [], kind: "choice", meta: {}, speak: "dog" })).toBe("🔊「dog」");
    expect(questionText({ level: "E50", tokens: [], kind: "order", meta: {}, bigText: "おはよう。" })).toBe("おはよう。（並べかえ）");
  });
});

describe("進級までの様子", () => {
  const E = (correct: number, total: number, avgMs: number) => ({ correct, total, avgMs });
  it("直近から続けてクリアした回数。正答率と速さのどちらが足りないかが分かる", () => {
    const p = promotionProgress([E(10, 10, 3000), E(9, 10, 5000), E(7, 10, 3000)], 4000, DEFAULT_SETTINGS);
    expect(p.needed).toBe(3);
    expect(p.streak).toBe(1);
    expect(p.checks.map((c) => [c.pass, c.accuracyOk, c.speedOk])).toEqual([
      [true, true, true],
      [false, true, false],
      [false, false, true],
    ]);
    expect(p.checks[1]).toMatchObject({ accuracyPct: 90, avgSeconds: 5 });
    expect(p.targetSeconds).toBe(4);
  });
  it("回答が少なすぎる回は数えない。3回続けてクリアで進級の条件", () => {
    const p = promotionProgress([E(2, 2, 1000), E(10, 10, 3000), E(10, 10, 3000), E(10, 10, 3000)], 4000, DEFAULT_SETTINGS);
    expect(p.checks).toHaveLength(3);
    expect(p.streak).toBe(3);
  });
});
