import { describe, expect, it } from "vitest";
import { JAPANESE_LEVELS, getJapaneseLevel, kanjiOfLevel, learnedKanjiThrough, partsOfGrade } from "@/domain/japanese/levels";
import { generateJapaneseQuestion } from "@/domain/japanese/generators";
import { KANA_WORDS, KANJI_FILES } from "@/domain/japanese/content";
import { NOT_FOR_LISTENING, confusablesOf, soundsSame, toHiragana, toKatakana } from "@/domain/japanese/kana";
import { parseSentence } from "@/domain/japanese/richText";
import { availableLevels, nextLevel, prevLevel } from "@/domain/levels";
import { seededRng } from "@/domain/math/rng";
import { toPublic, type Question } from "@/domain/math/question";
import { grade } from "@/domain/math/answer";
import { mistakeCategory } from "@/domain/math/categories";

const sample = (level: string, n: number, canSpeak: boolean, seed = 1): Question[] => {
  const rng = seededRng(seed);
  return Array.from({ length: n }, () => generateJapaneseQuestion(level, rng, { canSpeak }));
};

function expectFourDistinct(q: Question) {
  expect(q.kind).toBe("choice");
  expect(q.choices).toHaveLength(4);
  expect(new Set(q.choices).size).toBe(4);
  expect(q.answerChoice).toBeGreaterThanOrEqual(0);
  expect(q.answerChoice).toBeLessThan(4);
}

describe("国語のレベル表", () => {
  it("K01・K02 と、K10〜K61（学年ごとに約20字ずつ）", () => {
    const codes = JAPANESE_LEVELS.map((l) => l.code);
    expect(codes[0]).toBe("K01");
    expect(codes[1]).toBe("K02");
    expect(codes[2]).toBe("K10");
    expect(codes.at(-1)).toBe("K61");
    expect(codes).toHaveLength(2 + 52);
    expect([1, 2, 3, 4, 5, 6].map(partsOfGrade)).toEqual([4, 8, 10, 10, 10, 10]);
  });
  it("1年の漢字は4レベルに20字ずつ、配当表の並び順", () => {
    const sizes = ["K10", "K11", "K12", "K13"].map((c) => kanjiOfLevel(getJapaneseLevel(c)!).length);
    expect(sizes).toEqual([20, 20, 20, 20]);
    expect(kanjiOfLevel(getJapaneseLevel("K10")!)[0]!.kanji).toBe("一");
    expect(kanjiOfLevel(getJapaneseLevel("K13")!).at(-1)!.kanji).toBe("六");
  });
  it("習った漢字はレベルごとに増える", () => {
    expect(learnedKanjiThrough(getJapaneseLevel("K10")!).size).toBe(20);
    expect(learnedKanjiThrough(getJapaneseLevel("K13")!).size).toBe(80);
    expect(learnedKanjiThrough(getJapaneseLevel("K10")!).has("年")).toBe(false);
  });
  it("データがない学年は選べない。未確認のデータは開発中だけ選べる", () => {
    const dev = availableLevels("japanese", { includeUnreviewed: true }).map((l) => l.code);
    expect(dev).toEqual(["K01", "K02", "K10", "K11", "K12", "K13"]);
    const prod = availableLevels("japanese", { includeUnreviewed: false }).map((l) => l.code);
    // K02（カタカナ）は文字表だけで作るので常に使える。K01 と1年の漢字は確認後に使える
    expect(prod).toContain("K02");
    if (!KANJI_FILES[1]!.reviewed) expect(prod).not.toContain("K10");
    if (!KANA_WORDS.reviewed) expect(prod).not.toContain("K01");
  });
  it("次・前のレベルは空き番号（K03〜K09）を飛ばす", () => {
    const o = { includeUnreviewed: true };
    expect(nextLevel("japanese", "K02", o)).toBe("K10");
    expect(prevLevel("japanese", "K10", o)).toBe("K02");
    expect(nextLevel("japanese", "K13", o)).toBeNull(); // 2年のデータはまだない
    expect(prevLevel("japanese", "K01", o)).toBeNull();
  });
});

describe("ひらがな（K01）", () => {
  it("読み上げが使えないときは、絵を選ぶ問題だけ", () => {
    for (const q of sample("K01", 200, false)) {
      expectFourDistinct(q);
      expect(q.meta.type).toBe("picture");
      expect(q.speak).toBeUndefined();
      const w = KANA_WORDS.words.find((x) => x.emoji === q.choices![q.answerChoice!])!;
      expect(w.kana).toBe(q.bigText);
      // ほかの絵は、その文字で始まらない
      for (const [i, c] of q.choices!.entries()) {
        if (i !== q.answerChoice) expect(KANA_WORDS.words.find((x) => x.emoji === c)!.kana).not.toBe(q.bigText);
      }
    }
  });
  it("読み上げが使えるときは、聞き取りも出る。同じ音に聞こえる文字は選択肢に入れない", () => {
    const qs = sample("K01", 400, true);
    expect(qs.some((q) => q.meta.type === "listen")).toBe(true);
    expect(qs.some((q) => q.meta.type === "picture")).toBe(true);
    for (const q of qs.filter((x) => x.meta.type === "listen")) {
      expectFourDistinct(q);
      expect(q.choices![q.answerChoice!]).toBe(q.speak);
      expect(NOT_FOR_LISTENING.has(q.speak!)).toBe(false);
      for (const [i, c] of q.choices!.entries()) if (i !== q.answerChoice) expect(soundsSame(c, q.speak!)).toBe(false);
    }
  });
  it("まちがえやすい文字", () => {
    expect(confusablesOf("ぬ")).toContain("め");
    expect(confusablesOf("シ")).toContain("ツ");
    expect(soundsSame("じ", "ぢ")).toBe(true);
    expect(soundsSame("お", "を")).toBe(true);
    expect(toKatakana("きゃ")).toBe("キャ");
    expect(toHiragana("キャ")).toBe("きゃ");
  });
});

describe("カタカナ（K02）", () => {
  it("カタカナを見て、ひらがなの読みを選ぶ", () => {
    for (const q of sample("K02", 300, false)) {
      expectFourDistinct(q);
      expect(q.meta.type).toBe("read");
      expect(q.choices![q.answerChoice!]).toBe(toHiragana(q.bigText!));
      for (const [i, c] of q.choices!.entries()) if (i !== q.answerChoice) expect(soundsSame(c, q.bigText!)).toBe(false);
    }
  });
  it("聞き取りではカタカナを選ぶ", () => {
    const listen = sample("K02", 300, true).filter((q) => q.meta.type === "listen");
    expect(listen.length).toBeGreaterThan(0);
    for (const q of listen) expect(q.choices![q.answerChoice!]).toBe(toKatakana(q.speak!));
  });
});

describe("漢字（K10〜K13）", () => {
  for (const code of ["K10", "K11", "K12", "K13"]) {
    it(`${code}：読み・漢字えらびの両方が出て、正解はデータどおり`, () => {
      const qs = sample(code, 300, false, 5);
      expect(new Set(qs.map((q) => q.meta.type))).toEqual(new Set(["read", "write"]));
      const entries = kanjiOfLevel(getJapaneseLevel(code)!);
      for (const q of qs) {
        expectFourDistinct(q);
        const entry = entries.find((e) => e.kanji === q.meta.kanji)!;
        expect(entry).toBeDefined();
        const target = q.rich!.find((s) => s.t === "target")!;
        expect(target.t === "target" && target.v).toBe(q.meta.word);
        const ex = entry.examples.find((e) => e.word === q.meta.word && parseSentence(e.sentence, e.reading).segments.length)!;
        if (q.meta.type === "read") {
          expect(q.choices![q.answerChoice!]).toBe(target.t === "target" ? target.rt : "");
          expect(q.choices).toEqual(expect.arrayContaining(ex.readWrong.filter((w) => q.choices!.includes(w))));
        } else {
          expect(q.choices![q.answerChoice!]).toBe(q.meta.word);
        }
      }
    });
  }

  it("端末に送る問題に答えが入らない（読みの問題は読みを消し、漢字の問題は漢字を消す）", () => {
    for (const q of sample("K12", 200, false, 9)) {
      const pub = toPublic(q);
      const t = pub.rich!.find((s) => s.t === "target")!;
      if (t.t !== "target") throw new Error();
      if (q.meta.type === "read") {
        expect(t.v).toBe(q.meta.word);
        expect(t.rt).toBe("");
      } else {
        expect(t.v).toBe("");
        expect(t.rt).not.toBe("");
      }
      expect(JSON.stringify(pub)).not.toContain("answerChoice");
      expect(JSON.stringify(pub)).not.toContain("meta");
    }
  });

  it("選択肢の採点と、間違いの分類", () => {
    const [q] = sample("K10", 1, false);
    expect(grade(q!, { kind: "choice", index: q!.answerChoice! }).correct).toBe(true);
    expect(grade(q!, { kind: "choice", index: (q!.answerChoice! + 1) % 4 }).correct).toBe(false);
    expect(grade(q!, { kind: "choice", index: 7 }).invalid).toBe(true);
    expect(mistakeCategory(q!)).toMatch(/^K10 (読み|漢字えらび)$/);
  });
});

describe("例文の書式", () => {
  it("ふりがな・問題の部分・ふつうの文字に分ける", () => {
    expect(parseSentence("{右|みぎ}の [[手]]を あげる。", "て").segments).toEqual([
      { t: "ruby", base: "右", rt: "みぎ" },
      { t: "text", v: "の " },
      { t: "target", v: "手", rt: "て" },
      { t: "text", v: "を あげる。" },
    ]);
  });
});
