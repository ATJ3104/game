// 例文の書式
//   {漢字|よみ}  … ふりがな付きの漢字（問題以外の漢字は必ずこの形で書く）
//   [[漢字]]     … 問題の部分（読みは例の reading を使う）
// 例: "{右|みぎ}の [[手]]を あげる。"
import type { Segment } from "../math/question";

const TOKEN = /\{([^|{}]+)\|([^|{}]+)\}|\[\[([^\]]+)\]\]/g;

export interface ParsedSentence {
  segments: Segment[];
  /** 問題の部分（[[ ]]）の数 */
  targetCount: number;
}

export function parseSentence(src: string, targetReading: string): ParsedSentence {
  const segments: Segment[] = [];
  let last = 0;
  let targetCount = 0;
  for (const m of src.matchAll(TOKEN)) {
    if (m.index! > last) segments.push({ t: "text", v: src.slice(last, m.index) });
    if (m[1] !== undefined) segments.push({ t: "ruby", base: m[1], rt: m[2]! });
    else {
      segments.push({ t: "target", v: m[3]!, rt: targetReading });
      targetCount++;
    }
    last = m.index! + m[0].length;
  }
  if (last < src.length) segments.push({ t: "text", v: src.slice(last) });
  return { segments, targetCount };
}

/** 漢字（CJK統合漢字・々） */
export function isKanji(ch: string): boolean {
  return /[一-鿿㐀-䶿々]/.test(ch);
}

export function kanjiIn(s: string): string[] {
  return [...s].filter(isKanji);
}

export const HIRAGANA_RE = /^[ぁ-ゖー]+$/;
export const KATAKANA_RE = /^[ァ-ヺー]+$/;
