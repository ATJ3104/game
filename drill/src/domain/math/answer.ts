// 採点（純粋関数）。入力は子どもの端末から来る文字列なので、ここで厳しく検証する。
import type { MathQuestion } from "./question";
import { eq, gcd, isInt, parseDecimal, rat, toDecimalString, type Rational } from "./rational";

export type AnswerInput =
  | { kind: "int"; value: string }
  | { kind: "decimal"; value: string }
  | { kind: "fraction"; whole?: string; num?: string; den?: string }
  | { kind: "qr"; q: string; r: string }
  | { kind: "choice"; index: number }
  | { kind: "order"; order: number[] };

export type Feedback =
  | "reduce" // 値は合っているが約分していない（reduced のレベルでは ×）
  | "can_reduce"; // 正解だが約分できる（value のレベルでは 〇）

export interface GradeResult {
  correct: boolean;
  /** 入力として読めなかった（空欄など）。採点前に端末で弾くが念のため */
  invalid?: boolean;
  feedback?: Feedback;
}

const DIGITS = /^\d{1,9}$/;

function parseInt10(s: string | undefined): number | null {
  if (s === undefined) return null;
  const t = s.trim();
  return DIGITS.test(t) ? Number(t) : null;
}

/** 分数の入力を有理数に。整数部だけ・分数だけ・帯分数のいずれか */
export function parseFractionInput(input: { whole?: string; num?: string; den?: string }):
  | { value: Rational; whole: number; num: number | null; den: number | null }
  | null {
  const hasWhole = (input.whole ?? "").trim() !== "";
  const hasNum = (input.num ?? "").trim() !== "";
  const hasDen = (input.den ?? "").trim() !== "";
  const whole = hasWhole ? parseInt10(input.whole) : 0;
  if (whole === null) return null;
  if (!hasNum && !hasDen) {
    if (!hasWhole) return null;
    return { value: rat(whole), whole, num: null, den: null };
  }
  if (hasNum !== hasDen) return null; // 分子と分母は両方必要
  const n = parseInt10(input.num);
  const d = parseInt10(input.den);
  if (n === null || d === null || d === 0) return null;
  return { value: rat(whole * d + n, d), whole, num: n, den: d };
}

/** 約分しきった形か（整数の答えは整数で、分数は既約・帯分数なら真分数部分） */
export function isSimplestForm(p: { whole: number; num: number | null; den: number | null }, answer: Rational): boolean {
  if (isInt(answer)) return p.num === null;
  if (p.num === null || p.den === null) return false;
  if (p.num === 0) return false;
  if (gcd(p.num, p.den) !== 1) return false;
  if (p.whole > 0 && p.num >= p.den) return false; // 帯分数の分数部分は真分数
  return true;
}

export function grade(q: MathQuestion, input: AnswerInput): GradeResult {
  if (input.kind !== q.kind) return { correct: false, invalid: true };
  switch (input.kind) {
    case "order": {
      const tiles = q.tiles ?? [];
      const ok =
        input.order.length === tiles.length &&
        new Set(input.order).size === tiles.length &&
        input.order.every((i) => Number.isInteger(i) && i >= 0 && i < tiles.length);
      if (!ok) return { correct: false, invalid: true };
      // 同じ単語のカードが2まいあっても、ならんだ単語で比べる
      return { correct: input.order.map((i) => tiles[i]).join(" ") === (q.answerTokens ?? []).join(" ") };
    }
    case "choice": {
      const n = q.choices?.length ?? 0;
      if (!Number.isInteger(input.index) || input.index < 0 || input.index >= n) return { correct: false, invalid: true };
      return { correct: input.index === q.answerChoice };
    }
    case "int": {
      const v = parseInt10(input.value);
      if (v === null) return { correct: false, invalid: true };
      return { correct: eq(rat(v), q.value!) };
    }
    case "decimal": {
      const v = parseDecimal(input.value);
      if (v === null) return { correct: false, invalid: true };
      return { correct: eq(v, q.value!) }; // 0.50 も 0.5 も正解
    }
    case "qr": {
      const qv = parseInt10(input.q);
      const rTrim = input.r.trim();
      const rv = rTrim === "" ? 0 : parseInt10(rTrim); // あまり 0 は空欄でもよい
      if (qv === null || rv === null) return { correct: false, invalid: true };
      return { correct: qv === q.qr!.q && rv === q.qr!.r };
    }
    case "fraction": {
      const p = parseFractionInput(input);
      if (!p) return { correct: false, invalid: true };
      const answer = q.value!;
      if (!eq(p.value, answer)) return { correct: false };
      const simplest = isSimplestForm(p, answer);
      if (q.fractionRule === "reduced") {
        return simplest ? { correct: true } : { correct: false, feedback: "reduce" };
      }
      return simplest ? { correct: true } : { correct: true, feedback: "can_reduce" };
    }
  }
}

/** 正しい答えの表示用テキスト（間違えたときに見せる） */
export function answerText(q: MathQuestion): string {
  if (q.kind === "choice") return q.choices?.[q.answerChoice ?? -1] ?? "";
  if (q.kind === "order") return (q.answerTokens ?? []).join(" ");
  if (q.kind === "qr") return q.qr!.r === 0 ? `${q.qr!.q}` : `${q.qr!.q} あまり ${q.qr!.r}`;
  const v = q.value!;
  if (q.kind === "int") return String(v.n);
  if (q.kind === "decimal") return toDecimalString(v) ?? `${v.n}/${v.d}`;
  if (v.d === 1) return String(v.n);
  if (v.n > v.d) {
    const w = Math.floor(v.n / v.d);
    return `${v.n}/${v.d}（${w}と${v.n - w * v.d}/${v.d}）`;
  }
  return `${v.n}/${v.d}`;
}

/** 入力をそのまま記録用の文字列に */
export function inputText(input: AnswerInput, q?: MathQuestion): string {
  switch (input.kind) {
    case "choice":
      return q?.choices?.[input.index] ?? String(input.index);
    case "order":
      return input.order.map((i) => q?.tiles?.[i] ?? "?").join(" ");
    case "int":
    case "decimal":
      return input.value;
    case "qr":
      return input.r.trim() ? `${input.q} あまり ${input.r}` : input.q;
    case "fraction": {
      const f = input.num || input.den ? `${input.num ?? ""}/${input.den ?? ""}` : "";
      return input.whole ? (f ? `${input.whole}と${f}` : input.whole) : f;
    }
  }
}

/** 端末から来た JSON を AnswerInput として検証する */
export function parseAnswerInput(raw: unknown): AnswerInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" && v.length <= 20 ? v : undefined);
  switch (o.kind) {
    case "int":
    case "decimal": {
      const value = s(o.value);
      return value === undefined ? null : { kind: o.kind, value };
    }
    case "qr": {
      const q = s(o.q);
      const r = s(o.r) ?? "";
      return q === undefined ? null : { kind: "qr", q, r };
    }
    case "fraction":
      return { kind: "fraction", whole: s(o.whole), num: s(o.num), den: s(o.den) };
    case "choice":
      return typeof o.index === "number" && Number.isInteger(o.index) && o.index >= 0 && o.index < 10
        ? { kind: "choice", index: o.index }
        : null;
    case "order":
      return Array.isArray(o.order) && o.order.length <= 20 && o.order.every((i) => typeof i === "number")
        ? { kind: "order", order: o.order as number[] }
        : null;
    default:
      return null;
  }
}
