// 国語のレベル表（K01・K02 ＝ かな、K10〜K61 ＝ 学年別漢字を約20字ずつ）
import { GRADE_SIZES, KANA_WORDS, KANJI_FILES, type KanjiEntry } from "./content";
import { HAITOU } from "./haitou";

export interface JapaneseLevel {
  code: string;
  name: string;
  targetMs: number;
  kind: "hiragana" | "katakana" | "kanji";
  /** 漢字レベルのとき：学年と、学年の中の何番目の区切りか */
  grade?: number;
  part?: number;
  parts?: number;
  /** 教材データがあるか（ない学年はまだ使えない） */
  hasContent: boolean;
  /** 親の確認が済んでいるか */
  reviewed: boolean;
}

/** 学年ごとのレベル数（約20字ずつ） */
export function partsOfGrade(grade: number): number {
  return Math.round(GRADE_SIZES[grade]! / 20);
}

/** 学年の中で i 番目（0始まり）の漢字が、何番目の区切りに入るか */
export function partOfIndex(grade: number, index: number): number {
  return Math.floor((index * partsOfGrade(grade)) / GRADE_SIZES[grade]!);
}

function code(n: number): string {
  return `K${String(n).padStart(2, "0")}`;
}

function build(): JapaneseLevel[] {
  const out: JapaneseLevel[] = [
    { code: "K01", name: "ひらがな", targetMs: 4000, kind: "hiragana", hasContent: true, reviewed: KANA_WORDS.reviewed },
    // カタカナは文字表だけで作れる（絵を使わない）ので、確認済みとして扱う
    { code: "K02", name: "カタカナ", targetMs: 4000, kind: "katakana", hasContent: true, reviewed: true },
  ];
  let n = 10;
  for (let grade = 1; grade <= 6; grade++) {
    const parts = partsOfGrade(grade);
    const file = KANJI_FILES[grade];
    for (let part = 0; part < parts; part++) {
      out.push({
        code: code(n++),
        name: `${grade}年の漢字（${part + 1}/${parts}）`,
        targetMs: 7000,
        kind: "kanji",
        grade,
        part,
        parts,
        hasContent: !!file && file.kanji.length > 0,
        reviewed: !!file?.reviewed && file.kanji.length > 0,
      });
    }
  }
  return out;
}

export const JAPANESE_LEVELS: readonly JapaneseLevel[] = build();

export function getJapaneseLevel(code: string): JapaneseLevel | undefined {
  return JAPANESE_LEVELS.find((l) => l.code === code);
}

/** そのレベルで出題する漢字 */
export function kanjiOfLevel(level: JapaneseLevel): KanjiEntry[] {
  if (level.kind !== "kanji" || !level.grade) return [];
  const file = KANJI_FILES[level.grade];
  if (!file) return [];
  return file.kanji.filter((_, i) => partOfIndex(level.grade!, i) === level.part);
}

/** そのレベルまでに習う漢字（例文・熟語に使ってよい漢字） */
export function learnedKanjiThrough(level: JapaneseLevel): Set<string> {
  const set = new Set<string>();
  if (level.kind !== "kanji" || !level.grade) return set;
  // 配当表どおりに数える（教材データがまだない学年があっても判定できるように）
  for (let g = 1; g <= level.grade; g++) {
    HAITOU[g]!.forEach((ch, i) => {
      if (g < level.grade! || partOfIndex(g, i) <= level.part!) set.add(ch);
    });
  }
  return set;
}

/** 漢字 → 学年 */
export { haitouGrade as gradeOfKanji } from "./haitou";
