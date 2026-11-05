// プリント（紙の教材）の問題づくり。番号（seed）が同じなら同じプリントになる
import type { MathQuestion, Segment } from "./math/question";
import { generateQuestion } from "./math/generators";
import { questionKey } from "./math/question";
import { seededRng } from "./math/rng";
import { getJapaneseLevel, kanjiOfLevel } from "./japanese/levels";
import { parseSentence, isKanji } from "./japanese/richText";
import { shuffle } from "./japanese/generators";

export const PRINT_COUNTS = { math: [10, 20, 30, 40, 50], kanji: [5, 10, 15, 20] } as const;

export function clampCount(kind: "math" | "kanji", n: number): number {
  const list: readonly number[] = PRINT_COUNTS[kind];
  return list.includes(n) ? n : list[1]!;
}

/** 算数：同じ問題が続けて出ないように作る */
export function buildMathSheet(level: string, count: number, seed: number): MathQuestion[] {
  const rng = seededRng(seed);
  const out: MathQuestion[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 50; tries++) {
    const q = generateQuestion(level, rng);
    const key = questionKey(q);
    // 種類の少ないレベル（九九など）は、問題数が多いと重複を許す
    if (seen.has(key) && tries < count * 20) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

/** 書き取りの問題の部分：漢字は□（書くところ）、送りがななどのかなはそのまま印刷 */
export type WritePart = { t: "box"; answer: string } | { t: "kana"; v: string };

export interface KanjiWriteItem {
  kanji: string;
  word: string;
  reading: string;
  /** 例文。target の部分は parts で表す */
  segments: Segment[];
  parts: WritePart[];
}

export function writeParts(word: string): WritePart[] {
  return [...word].map((ch) => (isKanji(ch) ? { t: "box", answer: ch } : { t: "kana", v: ch }));
}

/**
 * 漢字の書き取り：そのレベルの漢字から、なるべくちがう字の例文を選ぶ。
 * 足りなければ同じ字の別の例文も使う
 */
export function buildKanjiSheet(level: string, count: number, seed: number): KanjiWriteItem[] {
  const lv = getJapaneseLevel(level);
  if (!lv || lv.kind !== "kanji") return [];
  const rng = seededRng(seed);
  const entries = shuffle(rng, kanjiOfLevel(lv));
  const firstRound = entries.map((e) => ({ e, ex: e.examples[Math.floor(rng.next() * e.examples.length)]! }));
  const rest = shuffle(
    rng,
    entries.flatMap((e) => e.examples.filter((x) => !firstRound.some((f) => f.ex === x)).map((ex) => ({ e, ex }))),
  );
  return [...firstRound, ...rest].slice(0, count).map(({ e, ex }) => ({
    kanji: e.kanji,
    word: ex.word,
    reading: ex.reading,
    segments: parseSentence(ex.sentence, ex.reading).segments,
    parts: writeParts(ex.word),
  }));
}

/** プリントの番号（URL に入れて同じプリントを作り直すため） */
export function newSeed(random: number = Math.random()): number {
  return 100000 + Math.floor(random * 900000);
}
