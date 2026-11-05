// 教材データの検証（`npm run content:check` でも実行）
import { describe, expect, it } from "vitest";
import { KANA_WORDS, KANJI_FILES } from "@/domain/japanese/content";
import { validateKanaWords, validateKanjiFile } from "@/domain/japanese/validate";

describe("教材データの検証", () => {
  for (const [grade, file] of Object.entries(KANJI_FILES)) {
    if (!file) continue;
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
