// 英語のレベル表
//   E01: アルファベット（大文字・小文字の対応）
//   E02: アルファベット（音を聞いて文字を選ぶ）
//   E10〜E49: 単語（テーマ別、content/english/words.json）
//   E50〜E69: フレーズ（content/english/phrases.json）
import { PHRASES, WORDS, type EnglishPhrase, type EnglishWord } from "./content";

export type EnglishLevelKind = "alpha_case" | "alpha_listen" | "words" | "phrases";

export interface EnglishLevel {
  code: string;
  name: string;
  targetMs: number;
  kind: EnglishLevelKind;
  hasContent: boolean;
  reviewed: boolean;
  words?: EnglishWord[];
  phrases?: EnglishPhrase[];
}

function build(): EnglishLevel[] {
  return [
    // アルファベットは文字表だけで作るので、確認済みとして扱う
    { code: "E01", name: "アルファベット（おおもじ・こもじ）", targetMs: 4000, kind: "alpha_case", hasContent: true, reviewed: true },
    { code: "E02", name: "アルファベット（きいて えらぶ）", targetMs: 4000, kind: "alpha_listen", hasContent: true, reviewed: true },
    ...WORDS.levels.map(
      (l): EnglishLevel => ({
        code: l.code,
        name: `たんご：${l.theme}`,
        targetMs: 5000,
        kind: "words",
        hasContent: l.words.length > 0,
        reviewed: WORDS.reviewed,
        words: l.words,
      }),
    ),
    ...PHRASES.levels.map(
      (l): EnglishLevel => ({
        code: l.code,
        name: `フレーズ：${l.theme}`,
        targetMs: 10000,
        kind: "phrases",
        hasContent: l.phrases.length > 0,
        reviewed: PHRASES.reviewed,
        phrases: l.phrases,
      }),
    ),
  ];
}

export const ENGLISH_LEVELS: readonly EnglishLevel[] = build();

export function getEnglishLevel(code: string): EnglishLevel | undefined {
  return ENGLISH_LEVELS.find((l) => l.code === code);
}
