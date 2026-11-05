// 国語の教材データ（content/ の JSON）の読み込み
import grade1 from "@content/kanji/grade1.json";
import kanaWords from "@content/kana/words.json";

export interface KanjiExample {
  word: string;
  reading: string;
  sentence: string;
  readWrong: string[];
  kanjiWrong: string[];
}

export interface KanjiEntry {
  kanji: string;
  on: string[];
  kun: string[];
  examples: KanjiExample[];
}

export interface KanjiFile {
  grade: number;
  reviewed: boolean;
  kanji: KanjiEntry[];
}

export interface KanaWord {
  kana: string;
  word: string;
  emoji: string;
}

export interface KanaWordsFile {
  reviewed: boolean;
  words: KanaWord[];
}

/** 学年別漢字配当表の字数 */
export const GRADE_SIZES: Record<number, number> = { 1: 80, 2: 160, 3: 200, 4: 202, 5: 193, 6: 191 };

/** 作成済みの学年のデータ（まだない学年は undefined） */
export const KANJI_FILES: Partial<Record<number, KanjiFile>> = {
  1: grade1 as KanjiFile,
};

export const KANA_WORDS = kanaWords as KanaWordsFile;
