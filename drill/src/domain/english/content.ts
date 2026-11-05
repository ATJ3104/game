// 英語の教材データ（content/english/*.json）
import words from "@content/english/words.json";
import phrases from "@content/english/phrases.json";

/** 単語。ja はひらがな・カタカナだけ（小1でも読めるように）。emoji は絵の代わり */
export interface EnglishWord {
  en: string;
  ja: string;
  emoji: string;
}

export interface WordLevel {
  /** E10〜E49 */
  code: string;
  /** テーマ（例：どうぶつ（1）） */
  theme: string;
  words: EnglishWord[];
}

/** フレーズ。en は大文字で始まり . ? ! で終わる。並べかえ問題は en を空白で区切って使う */
export interface EnglishPhrase {
  en: string;
  ja: string;
}

export interface PhraseLevel {
  /** E50〜E69 */
  code: string;
  theme: string;
  phrases: EnglishPhrase[];
}

export interface WordsFile {
  reviewed: boolean;
  levels: WordLevel[];
}

export interface PhrasesFile {
  reviewed: boolean;
  levels: PhraseLevel[];
}

export const WORDS = words as WordsFile;
export const PHRASES = phrases as PhrasesFile;
