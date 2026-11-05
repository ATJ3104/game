// 教科共通のレベル表・問題生成の入口
import type { Subject } from "./settings";
import { MATH_LEVELS } from "./math/levels";
import { generateQuestion as generateMath } from "./math/generators";
import { JAPANESE_LEVELS } from "./japanese/levels";
import { generateJapaneseQuestion } from "./japanese/generators";
import { ENGLISH_LEVELS } from "./english/levels";
import { generateEnglishQuestion } from "./english/generators";
import type { Question } from "./math/question";
import type { Rng } from "./math/rng";

export interface LevelInfo {
  code: string;
  name: string;
  targetMs: number;
  /** 子どもに出せる状態か（国語：データがあり、親の確認が済んでいる） */
  available: boolean;
  /** データはあるが未確認（開発中のみ選べる） */
  unreviewed?: boolean;
}

/** 実装済みの教科 */
export const IMPLEMENTED_SUBJECTS: readonly Subject[] = ["math", "japanese", "english"];

export interface LevelOptions {
  /** 未確認の教材も使う（開発・確認用） */
  includeUnreviewed: boolean;
}

export function allLevels(subject: Subject, opts: LevelOptions): LevelInfo[] {
  if (subject === "math") return MATH_LEVELS.map((l) => ({ ...l, available: true }));
  if (subject === "japanese") {
    return JAPANESE_LEVELS.map((l) => ({
      code: l.code,
      name: l.name,
      targetMs: l.targetMs,
      available: l.hasContent && (l.reviewed || opts.includeUnreviewed),
      unreviewed: l.hasContent && !l.reviewed,
    }));
  }
  if (subject === "english") {
    return ENGLISH_LEVELS.map((l) => ({
      code: l.code,
      name: l.name,
      targetMs: l.targetMs,
      available: l.hasContent && (l.reviewed || opts.includeUnreviewed),
      unreviewed: l.hasContent && !l.reviewed,
    }));
  }
  return [];
}

/** 選べるレベルだけ */
export function availableLevels(subject: Subject, opts: LevelOptions): LevelInfo[] {
  return allLevels(subject, opts).filter((l) => l.available);
}

export function getLevel(subject: Subject, code: string): LevelInfo | undefined {
  return allLevels(subject, { includeUnreviewed: true }).find((l) => l.code === code);
}

export function levelIndex(subject: Subject, code: string, opts: LevelOptions): number {
  return availableLevels(subject, opts).findIndex((l) => l.code === code);
}

/** 次のレベル（選べるものの中で） */
export function nextLevel(subject: Subject, code: string, opts: LevelOptions): string | null {
  const list = availableLevels(subject, opts);
  const i = list.findIndex((l) => l.code === code);
  return i >= 0 && i < list.length - 1 ? list[i + 1]!.code : null;
}

/** 前のレベル（復習で混ぜる） */
export function prevLevel(subject: Subject, code: string, opts: LevelOptions): string | null {
  const list = availableLevels(subject, opts);
  const i = list.findIndex((l) => l.code === code);
  return i > 0 ? list[i - 1]!.code : null;
}

export interface GenOptions {
  canSpeak: boolean;
}

export function generateFor(subject: Subject, level: string, rng: Rng, opts: GenOptions): Question {
  if (subject === "math") return generateMath(level, rng);
  if (subject === "japanese") return generateJapaneseQuestion(level, rng, opts);
  if (subject === "english") return generateEnglishQuestion(level, rng, opts);
  throw new Error(`subject not implemented: ${subject}`);
}
