import { describe, expect, it } from "vitest";
import { UPPER, generateEnglishQuestion, phraseQuestion, wordQuestion } from "@/domain/english/generators";
import { seededRng } from "@/domain/math/rng";
import { grade, inputText, parseAnswerInput } from "@/domain/math/answer";
import { toPublic, type Question } from "@/domain/math/question";
import { mistakeCategory } from "@/domain/math/categories";

const words = [
  { en: "dog", ja: "いぬ", emoji: "🐕" },
  { en: "cat", ja: "ねこ", emoji: "🐱" },
  { en: "bird", ja: "とり", emoji: "🐦" },
  { en: "fish", ja: "さかな", emoji: "🐟" },
  { en: "rabbit", ja: "うさぎ", emoji: "🐰" },
  { en: "bear", ja: "くま", emoji: "🐻" },
  { en: "lion", ja: "ライオン", emoji: "🦁" },
  { en: "monkey", ja: "さる", emoji: "🐒" },
];
const phrases = [
  { en: "Good morning.", ja: "おはよう。" },
  { en: "Good night.", ja: "おやすみ。" },
  { en: "Thank you.", ja: "ありがとう。" },
  { en: "See you.", ja: "またね。" },
  { en: "Nice to meet you.", ja: "はじめまして。" },
  { en: "How are you?", ja: "げんき？" },
];

function sample(n: number, f: (r: ReturnType<typeof seededRng>) => Question, seed = 1): Question[] {
  const rng = seededRng(seed);
  return Array.from({ length: n }, () => f(rng));
}

function fourDistinct(q: Question) {
  expect(q.kind).toBe("choice");
  expect(q.choices).toHaveLength(4);
  expect(new Set(q.choices).size).toBe(4);
}

describe("アルファベット", () => {
  it("E01：大文字⇄小文字。正解はおなじ文字", () => {
    for (const q of sample(300, (r) => generateEnglishQuestion("E01", r, { canSpeak: false }))) {
      fourDistinct(q);
      const ans = q.choices![q.answerChoice!]!;
      expect(ans.toLowerCase()).toBe(q.bigText!.toLowerCase());
      expect(ans).not.toBe(q.bigText);
      // 選択肢はすべて大文字か、すべて小文字
      const allUpper = q.choices!.every((c) => c === c.toUpperCase());
      const allLower = q.choices!.every((c) => c === c.toLowerCase());
      expect(allUpper || allLower).toBe(true);
    }
  });
  it("E02：読み上げが使えれば聞き取り（英語の声）、使えなければ大文字・小文字の問題", () => {
    const listen = sample(100, (r) => generateEnglishQuestion("E02", r, { canSpeak: true }));
    for (const q of listen) {
      fourDistinct(q);
      expect(q.speakLang).toBe("en-US");
      expect(q.choices![q.answerChoice!]).toBe(q.speak);
      expect(UPPER.includes(q.speak!)).toBe(true);
    }
    for (const q of sample(50, (r) => generateEnglishQuestion("E02", r, { canSpeak: false }))) {
      expect(q.speak).toBeUndefined();
      expect(q.meta.type).toBe("case");
    }
  });
});

describe("単語", () => {
  it("3つの形（聞き取り・英語→意味・意味→英語）が出て、正解はデータどおり", () => {
    const qs = sample(300, (r) => wordQuestion("E10", r, words, true));
    expect(new Set(qs.map((q) => q.meta.type))).toEqual(new Set(["listen", "en2ja", "ja2en"]));
    for (const q of qs) {
      fourDistinct(q);
      const w = words.find((x) => x.en === q.meta.en)!;
      const ans = q.choices![q.answerChoice!];
      if (q.meta.type === "ja2en") {
        expect(ans).toBe(w.en);
        expect(q.speak).toBeUndefined(); // 答えを読み上げない
      } else {
        expect(ans).toBe(`${w.emoji} ${w.ja}`);
      }
    }
  });
  it("読み上げが使えなければ聞き取りは出ない", () => {
    const qs = sample(200, (r) => wordQuestion("E10", r, words, false));
    expect(qs.some((q) => q.meta.type === "listen")).toBe(false);
    expect(qs.every((q) => q.speak === undefined)).toBe(true);
  });
});

describe("フレーズ", () => {
  it("並べかえ：カードは正解の単語のならべかえ、端末には正しい順を送らない", () => {
    const qs = sample(300, (r) => phraseQuestion("E50", r, phrases, true)).filter((q) => q.kind === "order");
    expect(qs.length).toBeGreaterThan(50);
    for (const q of qs) {
      expect([...q.tiles!].sort()).toEqual([...q.answerTokens!].sort());
      expect(q.answerTokens!.join(" ")).toBe(q.meta.en);
      const pub = toPublic(q);
      expect(pub.tiles).toEqual(q.tiles);
      expect(JSON.stringify(pub)).not.toContain("answerTokens");
    }
  });
  it("並べかえの採点", () => {
    const q = sample(300, (r) => phraseQuestion("E50", r, phrases, false)).find(
      (x) => x.kind === "order" && x.meta.en === "Nice to meet you.",
    )!;
    const correct = q.answerTokens!.map((t) => q.tiles!.indexOf(t));
    expect(grade(q, { kind: "order", order: correct }).correct).toBe(true);
    expect(inputText({ kind: "order", order: correct }, q)).toBe("Nice to meet you.");
    expect(grade(q, { kind: "order", order: [...correct].reverse() }).correct).toBe(false);
    expect(grade(q, { kind: "order", order: [0, 0, 1, 2] }).invalid).toBe(true);
    expect(grade(q, { kind: "order", order: [0] }).invalid).toBe(true);
    expect(parseAnswerInput({ kind: "order", order: [1, 0] })).toEqual({ kind: "order", order: [1, 0] });
    expect(parseAnswerInput({ kind: "order", order: "x" })).toBeNull();
  });
  it("同じ単語のカードが2まいあっても、ならびが正しければ正解", () => {
    const q: Question = {
      level: "E50",
      tokens: [],
      kind: "order",
      tiles: ["you", "Thank", "you"],
      answerTokens: ["Thank", "you", "you"],
      meta: {},
    };
    expect(grade(q, { kind: "order", order: [1, 2, 0] }).correct).toBe(true);
    expect(grade(q, { kind: "order", order: [1, 0, 2] }).correct).toBe(true);
  });
  it("選択肢の問題は意味がデータどおり", () => {
    for (const q of sample(300, (r) => phraseQuestion("E50", r, phrases, true)).filter((x) => x.kind === "choice")) {
      fourDistinct(q);
      const p = phrases.find((x) => x.en === q.meta.en)!;
      expect(q.choices![q.answerChoice!]).toBe(q.meta.type === "ja2en" ? p.en : p.ja);
    }
  });
  it("間違いの分類", () => {
    const [q] = sample(1, (r) => wordQuestion("E12", r, words, false));
    expect(mistakeCategory(q!)).toMatch(/^E12 (英語→意味|意味→英語)$/);
  });
});
