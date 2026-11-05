import type { Rational } from "./rational";

/** 問題の表示部品 */
export type Token =
  | { t: "n"; v: string } // 数（整数・小数）
  | { t: "f"; n: string; d: string } // 分数（n が "□" のときは空欄）
  | { t: "op"; v: "+" | "−" | "×" | "÷" | "=" | "(" | ")" };

/**
 * 答えの入力形式
 * - int: 整数（テンキー）
 * - decimal: 小数（テンキー＋小数点）
 * - fraction: 分数（整数部〔帯分数用・省略可〕・分子・分母）
 * - qr: 商とあまり
 */
export type AnswerKind = "int" | "decimal" | "fraction" | "qr";

/**
 * 分数の答えの扱い
 * - value: 値が等しければ正解（約分していなくてもよい）
 * - reduced: 約分しきった形（既約の仮分数／帯分数、整数になるときは整数）だけ正解
 */
export type FractionRule = "value" | "reduced";

export interface MathQuestion {
  level: string;
  /** 問題文（「やくぶん しましょう」など。なければ式だけ） */
  prompt?: string;
  tokens: Token[];
  kind: AnswerKind;
  /** int / decimal / fraction の答え */
  value?: Rational;
  /** qr の答え */
  qr?: { q: number; r: number };
  fractionRule?: FractionRule;
  /** テスト・分析用の情報（演算の種類やオペランド） */
  meta: Record<string, number | string | boolean>;
}

/** 子どもの端末に送る形（答えと meta を含めない） */
export interface PublicQuestion {
  prompt?: string;
  tokens: Token[];
  kind: AnswerKind;
  /** 分数の答えで帯分数欄を出すか */
  allowMixed?: boolean;
}

export function toPublic(q: MathQuestion): PublicQuestion {
  return {
    prompt: q.prompt,
    tokens: q.tokens,
    kind: q.kind,
    allowMixed: q.kind === "fraction" ? true : undefined,
  };
}

/** 同じ問題の連続を避けるためのキー */
export function questionKey(q: MathQuestion): string {
  return JSON.stringify([q.prompt ?? "", q.tokens]);
}
