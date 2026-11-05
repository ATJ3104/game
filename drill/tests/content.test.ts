// 教材データの検証（`npm run content:check` でも実行）
import { describe, expect, it } from "vitest";
import { KANA_WORDS, KANJI_FILES } from "@/domain/japanese/content";
import { validateKanaWords, validateKanjiFile } from "@/domain/japanese/validate";

describe("教材データの検証", () => {
  for (const [grade, file] of Object.entries(KANJI_FILES)) {
    if (!file) continue;
    if (file.kanji.length === 0) {
      it.skip(`漢字 ${grade}年（作成中）`, () => {});
      continue;
    }
    it(`漢字 ${grade}年（${file.reviewed ? "確認済み" : "未確認"}）`, () => {
      const r = validateKanjiFile(file);
      if (r.warnings.length) console.warn(`[${grade}年 注意]\n` + r.warnings.join("\n"));
      expect(r.errors).toEqual([]);
    });
  }
  it(`かなの絵（${KANA_WORDS.reviewed ? "確認済み" : "未確認"}）`, () => {
    const r = validateKanaWords(KANA_WORDS);
    expect(r.errors).toEqual([]);
  });
});

describe("検証そのものが機能していること（わざと壊したデータ）", () => {
  const base = KANJI_FILES[1]!;
  const broken = (mutate: (f: typeof base) => void) => {
    const f = structuredClone(base);
    mutate(f);
    return validateKanjiFile(f).errors.join("\n");
  };
  it("字数・重複", () => {
    expect(broken((f) => f.kanji.pop())).toMatch(/字数が 79/);
    expect(broken((f) => (f.kanji[1]!.kanji = "一"))).toMatch(/重複/);
    expect(broken((f) => ([f.kanji[0], f.kanji[1]] = [f.kanji[1]!, f.kanji[0]!]))).toMatch(/1番目が「右」（配当表の並びでは「一」）/);
  });
  it("正解が選択肢に入っている・数が違う・重複", () => {
    expect(broken((f) => (f.kanji[0]!.examples[0]!.readWrong = ["ひとつ", "a", "b"]))).toMatch(/正解「ひとつ」/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.kanjiWrong = ["二つ", "二つ", "三つ"]))).toMatch(/重複/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.readWrong = ["に"]))).toMatch(/3つ（1つ）/);
  });
  it("まだ習わない漢字・ふりがなのない漢字・読みの形式", () => {
    // K10 の「一」の例に、K13 の「年」を使う
    expect(broken((f) => (f.kanji[0]!.examples[0]!.word = "一年"))).toMatch(/「年」はこのレベル（K10）までに習わない/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.sentence = "右の [[一つ]]"))).toMatch(/ふりがながありません/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.sentence = "{年|とし}の [[一つ]]"))).toMatch(/習わない漢字（かなで書く）/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.reading = "ヒトツ"))).toMatch(/ひらがなで/);
    expect(broken((f) => (f.kanji[0]!.on = ["いち"]))).toMatch(/カタカナで/);
    expect(broken((f) => (f.kanji[0]!.examples[0]!.sentence = "あめを もらう。"))).toMatch(/ちょうど1つ/);
  });
  it("漢字の選択肢に上の学年の漢字", () => {
    expect(broken((f) => (f.kanji[1]!.examples[0]!.kanjiWrong = ["左", "古", "石"]))).toMatch(/「古」は1年までの漢字ではありません/);
  });
});

describe("まだ習わない漢字の例外", () => {
  it("allowUnlearned に書いた字だけ、エラーでなく注意になる", () => {
    const f = structuredClone(KANJI_FILES[1]!);
    f.kanji[0]!.examples[0]!.word = "一年";
    f.kanji[0]!.examples[0]!.sentence = "[[一年]]";
    f.kanji[0]!.examples[0]!.allowUnlearned = ["年"];
    const r = validateKanjiFile(f);
    expect(r.errors.join("\n")).not.toMatch(/「年」/);
    expect(r.warnings.join("\n")).toMatch(/「年」はまだ習わない漢字（例外として許可）/);
  });
});

import { PHRASES, WORDS } from "@/domain/english/content";
import { validatePhrases, validateWords } from "@/domain/english/validate";

describe("英語の教材データ", () => {
  (WORDS.levels.length ? it : it.skip)(`英語の単語（${WORDS.reviewed ? "確認済み" : "未確認"}）`, () => {
    const r = validateWords(WORDS);
    if (r.warnings.length) console.warn("[英語の単語 注意]\n" + r.warnings.join("\n"));
    expect(r.errors).toEqual([]);
  });
  (PHRASES.levels.length ? it : it.skip)(`英語のフレーズ（${PHRASES.reviewed ? "確認済み" : "未確認"}）`, () => {
    const r = validatePhrases(PHRASES);
    if (r.warnings.length) console.warn("[英語のフレーズ 注意]\n" + r.warnings.join("\n"));
    expect(r.errors).toEqual([]);
  });
  it("検証が機能していること", () => {
    const bad = validateWords({
      reviewed: false,
      levels: [{ code: "E11", theme: "x", words: [{ en: "Dog!", ja: "犬", emoji: "" }] }],
    }).errors.join("\n");
    expect(bad).toMatch(/E10 から順に/);
    expect(bad).toMatch(/8〜25こ/);
    expect(bad).toMatch(/英語の形式/);
    expect(bad).toMatch(/かなだけで/);
    expect(bad).toMatch(/絵文字がありません/);
    const badP = validatePhrases({
      reviewed: false,
      levels: [{ code: "E50", theme: "x", phrases: [{ en: "hello", ja: "こんにちは" }] }],
    }).errors.join("\n");
    expect(badP).toMatch(/大文字で始まり/);
    expect(badP).toMatch(/2〜8こ/);
  });
});
