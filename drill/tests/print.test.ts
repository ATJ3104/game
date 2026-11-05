import { describe, expect, it } from "vitest";
import { buildKanjiSheet, buildMathSheet, clampCount, newSeed, writeParts } from "@/domain/print";
import { questionKey } from "@/domain/math/question";
import { getJapaneseLevel, kanjiOfLevel } from "@/domain/japanese/levels";

describe("算数プリント", () => {
  it("番号が同じなら同じ問題、ちがえばちがう問題", () => {
    const a = buildMathSheet("M07", 30, 123456).map(questionKey);
    const b = buildMathSheet("M07", 30, 123456).map(questionKey);
    const c = buildMathSheet("M07", 30, 654321).map(questionKey);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
  it("指定した数だけ、そのレベルの問題で、なるべく重複しない", () => {
    const qs = buildMathSheet("M16", 50, 1);
    expect(qs).toHaveLength(50);
    expect(qs.every((q) => q.level === "M16")).toBe(true);
    expect(new Set(qs.map(questionKey)).size).toBe(50);
  });
  it("種類の少ないレベル（10までのたし算）でも50問そろう", () => {
    expect(buildMathSheet("M01", 50, 2)).toHaveLength(50);
  });
  it("問題数は決まった値だけ", () => {
    expect(clampCount("math", 30)).toBe(30);
    expect(clampCount("math", 9999)).toBe(20);
    expect(clampCount("kanji", 10)).toBe(10);
  });
  it("番号は6けた", () => {
    expect(newSeed(0)).toBe(100000);
    expect(newSeed(0.999999)).toBeLessThan(1000000);
  });
});

describe("漢字の書き取りプリント", () => {
  it("そのレベルの漢字だけ、まずはちがう字から選ぶ", () => {
    const items = buildKanjiSheet("K10", 20, 7);
    expect(items).toHaveLength(20);
    const levelKanji = new Set(kanjiOfLevel(getJapaneseLevel("K10")!).map((k) => k.kanji));
    expect(items.every((i) => levelKanji.has(i.kanji))).toBe(true);
    expect(new Set(items.map((i) => i.kanji)).size).toBe(20);
  });
  it("字の数より多いときは同じ字の別の例文を使い、同じ例文はくり返さない", () => {
    const items = buildKanjiSheet("K10", 30, 7);
    const keys = items.map((i) => i.word + i.segments.map((s) => (s.t === "text" ? s.v : "")).join(""));
    expect(new Set(keys).size).toBe(items.length);
  });
  it("□は漢字の数だけ、送りがなはそのまま", () => {
    expect(writeParts("休む")).toEqual([
      { t: "box", answer: "休" },
      { t: "kana", v: "む" },
    ]);
    expect(writeParts("立ち上がる").filter((p) => p.t === "box")).toHaveLength(2);
    for (const item of buildKanjiSheet("K16", 20, 3)) {
      const boxes = item.parts.filter((p) => p.t === "box").map((p) => (p.t === "box" ? p.answer : "")).join("");
      expect(boxes).toBe([...item.word].filter((c) => /[一-鿿]/.test(c)).join(""));
      expect(item.segments.some((s) => s.t === "target")).toBe(true);
    }
  });
  it("かなのレベルや知らないレベルでは作らない", () => {
    expect(buildKanjiSheet("K01", 10, 1)).toEqual([]);
    expect(buildKanjiSheet("X99", 10, 1)).toEqual([]);
  });
  it("番号が同じなら同じプリント", () => {
    expect(buildKanjiSheet("K12", 10, 99)).toEqual(buildKanjiSheet("K12", 10, 99));
  });
});
