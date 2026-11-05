// 有理数（分数）。小数・分数・整数の答えをすべてこれで正確に計算する（浮動小数点の誤差を避ける）

export interface Rational {
  n: number; // 分子（符号はここに持つ）
  d: number; // 分母（常に正）
}

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function lcm(a: number, b: number): number {
  return (a / gcd(a, b)) * b;
}

/** 約分した有理数を作る */
export function rat(n: number, d = 1): Rational {
  if (d === 0) throw new Error("denominator is zero");
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) throw new Error("not an integer");
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d) || 1;
  return { n: (s * n) / g, d: (s * d) / g };
}

export const add = (a: Rational, b: Rational) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Rational, b: Rational) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Rational, b: Rational) => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational) => {
  if (b.n === 0) throw new Error("division by zero");
  return rat(a.n * b.d, a.d * b.n);
};
export const eq = (a: Rational, b: Rational) => a.n * b.d === b.n * a.d;
export const isInt = (a: Rational) => rat(a.n, a.d).d === 1;
export const cmp = (a: Rational, b: Rational) => a.n * b.d - b.n * a.d;

/** 10進の小数文字列 → 有理数（"3.25", "0.5", ".5", "12"）。不正なら null */
export function parseDecimal(s: string): Rational | null {
  const m = /^(\d*)(?:\.(\d+))?$/.exec(s.trim());
  if (!m || (m[1] === "" && m[2] === undefined)) return null;
  const intPart = m[1] === "" ? "0" : m[1]!;
  const frac = m[2] ?? "";
  if (intPart.length + frac.length > 15) return null;
  return rat(Number(intPart + frac), 10 ** frac.length);
}

/** 小数点以下が有限桁で表せるなら小数の文字列に（"3.25"）。表せなければ null */
export function toDecimalString(r: Rational): string | null {
  const x = rat(r.n, r.d);
  let d = x.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1) return null; // 分母に 2・5 以外の素因数があれば割り切れない
  let p = 0;
  while ((x.n * 10 ** p) % x.d !== 0) p++;
  const scaled = (x.n * 10 ** p) / x.d;
  const neg = scaled < 0;
  const digits = String(Math.abs(scaled)).padStart(p + 1, "0");
  const head = digits.slice(0, digits.length - p);
  const tail = digits.slice(digits.length - p);
  return (neg ? "-" : "") + (p ? `${head}.${tail}` : head);
}

/** 小数点以下の桁数 */
export function decimalPlaces(r: Rational): number {
  const s = toDecimalString(r);
  if (s === null) return Infinity;
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}
