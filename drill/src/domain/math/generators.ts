// 算数の問題生成（M01〜M29）。答えは必ずコードで計算する。
import type { MathQuestion, Token } from "./question";
import { add, div, gcd, lcm, mul, rat, sub, toDecimalString, type Rational } from "./rational";
import { chance, pick, randInt, type Rng } from "./rng";

type Op = "+" | "−" | "×" | "÷";

const num = (v: number | string): Token => ({ t: "n", v: String(v) });
const op = (v: Op | "=" | "(" | ")"): Token => ({ t: "op", v });
const frac = (r: Rational): Token => ({ t: "f", n: String(r.n), d: String(r.d) });
const fracRaw = (n: number | string, d: number | string): Token => ({ t: "f", n: String(n), d: String(d) });
const dec = (r: Rational): Token => num(toDecimalString(r)!);

/** 各位でくり上がりがあるか */
export function hasCarry(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if ((a % 10) + (b % 10) >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** a − b（a ≥ b）で、各位でくり下がりがあるか */
export function hasBorrow(a: number, b: number): boolean {
  while (b > 0) {
    if (a % 10 < b % 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

function intQ(level: string, a: number, o: Op, b: number, extra: MathQuestion["meta"] = {}): MathQuestion {
  const value =
    o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : a / b;
  if (!Number.isInteger(value) || value < 0) throw new Error(`bad int question ${a}${o}${b}`);
  return {
    level,
    tokens: [num(a), op(o), num(b), op("=")],
    kind: "int",
    value: rat(value),
    meta: { a, b, op: o, ...extra },
  };
}

function qrQ(level: string, dividend: number, divisor: number): MathQuestion {
  const q = Math.floor(dividend / divisor);
  const r = dividend % divisor;
  return {
    level,
    tokens: [num(dividend), op("÷"), num(divisor), op("=")],
    kind: "qr",
    qr: { q, r },
    meta: { a: dividend, b: divisor, op: "÷", q, r },
  };
}

/** 条件を満たすまで作り直す（どのレベルも高い確率で1回で決まる作りにしてある） */
function retry<T>(f: () => T | null): T {
  for (let i = 0; i < 1000; i++) {
    const v = f();
    if (v !== null) return v;
  }
  throw new Error("generator failed");
}

// ---------- 整数のたし算・ひき算 ----------

function genM01(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randInt(rng, 0, 10);
    const b = randInt(rng, 0, 10 - a);
    if (a + b === 0) return null;
    return intQ("M01", a, "+", b);
  });
}

function genM02(rng: Rng): MathQuestion {
  const a = randInt(rng, 1, 10);
  const b = randInt(rng, 0, a);
  return intQ("M02", a, "−", b);
}

function genM03(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randInt(rng, 2, 9);
    const b = randInt(rng, 2, 9);
    return a + b >= 10 ? intQ("M03", a, "+", b) : null;
  });
}

function genM04(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randInt(rng, 11, 18);
    const b = randInt(rng, 2, 9);
    return a % 10 < b ? intQ("M04", a, "−", b) : null;
  });
}

function genM05(rng: Rng): MathQuestion {
  if (chance(rng, 0.5)) {
    const a = randInt(rng, 10, 90);
    const b = randInt(rng, 1, Math.min(9, 99 - a));
    return intQ("M05", a, "+", b);
  }
  const a = randInt(rng, 11, 99);
  const b = randInt(rng, 1, 9);
  return intQ("M05", a, "−", b);
}

function genM06(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randInt(rng, 10, 99);
    const b = randInt(rng, 10, 99);
    if (chance(rng, 0.5)) {
      return a + b <= 99 && !hasCarry(a, b) ? intQ("M06", a, "+", b) : null;
    }
    const [x, y] = a >= b ? [a, b] : [b, a];
    return x > y && !hasBorrow(x, y) ? intQ("M06", x, "−", y) : null;
  });
}

function genM07(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randInt(rng, 10, 99);
    const b = randInt(rng, 10, 99);
    if (chance(rng, 0.5)) {
      return (a % 10) + (b % 10) >= 10 ? intQ("M07", a, "+", b) : null;
    }
    const [x, y] = a >= b ? [a, b] : [b, a];
    return x > y && x % 10 < y % 10 ? intQ("M07", x, "−", y) : null;
  });
}

function genM08(rng: Rng): MathQuestion {
  if (chance(rng, 0.5)) {
    const a = randInt(rng, 100, 899);
    const b = randInt(rng, 100, 999 - a);
    return intQ("M08", a, "+", b);
  }
  const a = randInt(rng, 200, 999);
  const b = randInt(rng, 100, a - 1);
  return intQ("M08", a, "−", b);
}

// ---------- かけ算・わり算 ----------

function genKuku(level: string, dans: readonly number[], rng: Rng): MathQuestion {
  const a = pick(rng, dans);
  const b = randInt(rng, 1, 9);
  return intQ(level, a, "×", b, { dan: a });
}

const genM09 = (rng: Rng) => genKuku("M09", [2, 5, 3, 4], rng);
const genM10 = (rng: Rng) => genKuku("M10", [6, 7, 8, 9, 1], rng);
const genM11 = (rng: Rng) => genKuku("M11", [1, 2, 3, 4, 5, 6, 7, 8, 9], rng);

function genM12(rng: Rng): MathQuestion {
  const divisor = randInt(rng, 2, 9);
  const q = randInt(rng, 1, 9);
  return intQ("M12", divisor * q, "÷", divisor);
}

function genM13(rng: Rng): MathQuestion {
  const divisor = randInt(rng, 2, 9);
  const q = randInt(rng, 1, 9);
  const r = randInt(rng, 1, divisor - 1);
  return qrQ("M13", divisor * q + r, divisor);
}

function genM14(rng: Rng): MathQuestion {
  return intQ("M14", randInt(rng, 11, 99), "×", randInt(rng, 2, 9));
}

function genM15(rng: Rng): MathQuestion {
  return intQ("M15", randInt(rng, 100, 999), "×", randInt(rng, 2, 9));
}

function genM16(rng: Rng): MathQuestion {
  return intQ("M16", randInt(rng, 11, 99), "×", randInt(rng, 11, 99));
}

/** 2けた÷1けた（商は2けた、あまりあり・なしを半々） */
function genM17(rng: Rng): MathQuestion {
  return retry(() => {
    const divisor = randInt(rng, 2, 9);
    const q = randInt(rng, 10, Math.floor(99 / divisor));
    const r = chance(rng, 0.5) ? 0 : randInt(rng, 1, divisor - 1);
    const dividend = divisor * q + r;
    return q >= 10 && dividend <= 99 ? qrQ("M17", dividend, divisor) : null;
  });
}

/** 3けた÷1けた（商は2けた以上、あまりあり・なしを半々） */
function genM18(rng: Rng): MathQuestion {
  return retry(() => {
    const divisor = randInt(rng, 2, 9);
    const dividend = randInt(rng, 100, 999);
    const r = dividend % divisor;
    const wantZero = chance(rng, 0.5);
    if (wantZero !== (r === 0)) return null;
    return qrQ("M18", dividend, divisor);
  });
}

/** ÷2けた（わられる数は2〜3けた、あまりあり・なし） */
function genM19(rng: Rng): MathQuestion {
  return retry(() => {
    const divisor = randInt(rng, 11, 99);
    const q = randInt(rng, 1, Math.floor(999 / divisor));
    const r = chance(rng, 0.5) ? 0 : randInt(rng, 1, divisor - 1);
    const dividend = divisor * q + r;
    return dividend <= 999 ? qrQ("M19", dividend, divisor) : null;
  });
}

// ---------- 小数 ----------

/** 小数（小数第 places 位まで、整数にならない） */
function randDecimal(rng: Rng, minScaled: number, maxScaled: number, places: number): Rational {
  return retry(() => {
    const s = randInt(rng, minScaled, maxScaled);
    return s % 10 ** places === 0 || s % 10 === 0 ? null : rat(s, 10 ** places);
  });
}

function decQ(level: string, a: Rational, o: Op, b: Rational, value: Rational, extra: MathQuestion["meta"] = {}): MathQuestion {
  return {
    level,
    tokens: [dec(a), op(o), dec(b), op("=")],
    kind: "decimal",
    value,
    meta: { a: toDecimalString(a)!, b: toDecimalString(b)!, op: o, ...extra },
  };
}

function genM20(rng: Rng): MathQuestion {
  return retry(() => {
    const pa = chance(rng, 0.7) ? 1 : 2;
    const pb = chance(rng, 0.7) ? 1 : 2;
    const a = randDecimal(rng, 1, 999, pa);
    const b = randDecimal(rng, 1, 999, pb);
    if (chance(rng, 0.5)) return decQ("M20", a, "+", b, add(a, b));
    const [x, y] = a.n * b.d > b.n * a.d ? [a, b] : [b, a];
    const v = sub(x, y);
    return v.n > 0 ? decQ("M20", x, "−", y, v) : null;
  });
}

function genM21(rng: Rng): MathQuestion {
  if (chance(rng, 0.5)) {
    const a = randDecimal(rng, 11, 99, 1);
    const b = randInt(rng, 2, 9);
    return {
      level: "M21",
      tokens: [dec(a), op("×"), num(b), op("=")],
      kind: "decimal",
      value: mul(a, rat(b)),
      meta: { a: toDecimalString(a)!, b, op: "×" },
    };
  }
  return retry(() => {
    const b = randInt(rng, 2, 9);
    const q = rat(randInt(rng, 2, 99), 10);
    const a = mul(q, rat(b));
    if (a.d === 1) return null; // わられる数は小数にする
    return {
      level: "M21",
      tokens: [dec(a), op("÷"), num(b), op("=")],
      kind: "decimal",
      value: q,
      meta: { a: toDecimalString(a)!, b, op: "÷" },
    };
  });
}

function genM25(rng: Rng): MathQuestion {
  const a = randDecimal(rng, 2, 99, 1);
  const b = randDecimal(rng, 2, 99, 1);
  return decQ("M25", a, "×", b, mul(a, b));
}

function genM26(rng: Rng): MathQuestion {
  const d = randDecimal(rng, 2, 99, 1);
  const q = chance(rng, 0.5) ? rat(randInt(rng, 2, 20)) : randDecimal(rng, 2, 99, 1);
  const a = mul(q, d);
  return decQ("M26", a, "÷", d, div(a, d));
}

// ---------- 分数 ----------

function randProperFraction(rng: Rng, minDen: number, maxDen: number): Rational {
  return retry(() => {
    const d = randInt(rng, minDen, maxDen);
    const n = randInt(rng, 1, d - 1);
    return gcd(n, d) === 1 ? rat(n, d) : null;
  });
}

function fracQ(level: string, a: Rational, o: Op, b: Rational, value: Rational, rule: "value" | "reduced"): MathQuestion {
  return {
    level,
    tokens: [frac(a), op(o), frac(b), op("=")],
    kind: "fraction",
    value,
    fractionRule: rule,
    meta: { a: `${a.n}/${a.d}`, b: `${b.n}/${b.d}`, op: o, aDen: a.d, bDen: b.d },
  };
}

/** 同じ分母のたし算・ひき算（未約分でも正解） */
function genM22(rng: Rng): MathQuestion {
  return retry(() => {
    const d = randInt(rng, 3, 12);
    const x = randInt(rng, 1, d - 1);
    const y = randInt(rng, 1, d - 1);
    // 表示は約分しない形（同じ分母で見せる）
    if (chance(rng, 0.5)) {
      return {
        level: "M22",
        tokens: [fracRaw(x, d), op("+"), fracRaw(y, d), op("=")],
        kind: "fraction",
        value: rat(x + y, d),
        fractionRule: "value",
        meta: { aNum: x, bNum: y, den: d, op: "+" },
      } satisfies MathQuestion;
    }
    if (x === y) return null;
    const [p, q] = x > y ? [x, y] : [y, x];
    return {
      level: "M22",
      tokens: [fracRaw(p, d), op("−"), fracRaw(q, d), op("=")],
      kind: "fraction",
      value: rat(p - q, d),
      fractionRule: "value",
      meta: { aNum: p, bNum: q, den: d, op: "−" },
    } satisfies MathQuestion;
  });
}

/** 約分（既約分数のみ正解）／通分（□にあてはまる分子） */
function genM23(rng: Rng): MathQuestion {
  if (chance(rng, 0.5)) {
    const base = randProperFraction(rng, 2, 9);
    const k = randInt(rng, 2, 6);
    return {
      level: "M23",
      prompt: "やくぶん しましょう",
      tokens: [fracRaw(base.n * k, base.d * k), op("=")],
      kind: "fraction",
      value: base,
      fractionRule: "reduced",
      meta: { type: "reduce", n: base.n * k, d: base.d * k },
    };
  }
  const base = randProperFraction(rng, 2, 9);
  const k = randInt(rng, 2, 5);
  return {
    level: "M23",
    prompt: "□に あてはまる かずを かきましょう",
    tokens: [frac(base), op("="), fracRaw("□", base.d * k)],
    kind: "int",
    value: rat(base.n * k),
    meta: { type: "expand", n: base.n, d: base.d, newDen: base.d * k },
  };
}

/** ちがう分母のたし算・ひき算（約分まで必須） */
function genM24(rng: Rng): MathQuestion {
  return retry(() => {
    const a = randProperFraction(rng, 2, 12);
    const b = randProperFraction(rng, 2, 12);
    if (a.d === b.d || lcm(a.d, b.d) > 60) return null;
    if (chance(rng, 0.5)) return fracQ("M24", a, "+", b, add(a, b), "reduced");
    const [x, y] = a.n * b.d > b.n * a.d ? [a, b] : [b, a];
    const v = sub(x, y);
    return v.n > 0 ? fracQ("M24", x, "−", y, v, "reduced") : null;
  });
}

function randFraction(rng: Rng): Rational {
  return retry(() => {
    const d = randInt(rng, 2, 9);
    const n = randInt(rng, 1, 2 * d - 1);
    return gcd(n, d) === 1 ? rat(n, d) : null;
  });
}

function genM27(rng: Rng): MathQuestion {
  const a = randFraction(rng);
  const b = randFraction(rng);
  return fracQ("M27", a, "×", b, mul(a, b), "reduced");
}

function genM28(rng: Rng): MathQuestion {
  const a = randFraction(rng);
  const b = randFraction(rng);
  return fracQ("M28", a, "÷", b, div(a, b), "reduced");
}

// ---------- 計算の順序 ----------

type Expr = { k: "n"; v: number } | { k: "b"; o: Op; l: Expr; r: Expr; paren?: boolean };

const N = (v: number): Expr => ({ k: "n", v });
const B = (o: Op, l: Expr, r: Expr, paren = false): Expr => ({ k: "b", o, l, r, paren });

/** 整数だけで計算できるか確認しながら評価（途中で負・割り切れないなら null） */
export function evalExpr(e: Expr): number | null {
  if (e.k === "n") return e.v;
  const l = evalExpr(e.l);
  const r = evalExpr(e.r);
  if (l === null || r === null) return null;
  switch (e.o) {
    case "+":
      return l + r;
    case "−":
      return l - r >= 0 ? l - r : null;
    case "×":
      return l * r;
    case "÷":
      return r !== 0 && l % r === 0 ? l / r : null;
  }
}

function exprTokens(e: Expr): Token[] {
  if (e.k === "n") return [num(e.v)];
  const inner = [...exprTokens(e.l), op(e.o), ...exprTokens(e.r)];
  return e.paren ? [op("("), ...inner, op(")")] : inner;
}

const M29_PATTERNS: ((rng: Rng) => Expr)[] = [
  (g) => B("+", N(randInt(g, 1, 50)), B("×", N(randInt(g, 2, 9)), N(randInt(g, 2, 9)))),
  (g) => B("−", N(randInt(g, 20, 99)), B("×", N(randInt(g, 2, 9)), N(randInt(g, 2, 9)))),
  (g) => B("+", B("×", N(randInt(g, 2, 9)), N(randInt(g, 2, 9))), N(randInt(g, 1, 50))),
  (g) => B("×", B("+", N(randInt(g, 1, 9)), N(randInt(g, 1, 9)), true), N(randInt(g, 2, 9))),
  (g) => B("×", B("−", N(randInt(g, 5, 20)), N(randInt(g, 1, 9)), true), N(randInt(g, 2, 9))),
  (g) => B("×", N(randInt(g, 2, 9)), B("+", N(randInt(g, 1, 9)), N(randInt(g, 1, 9)), true)),
  (g) => B("+", N(randInt(g, 1, 50)), B("÷", N(randInt(g, 4, 81)), N(randInt(g, 2, 9)))),
  (g) => B("−", B("÷", N(randInt(g, 10, 81)), N(randInt(g, 2, 9))), N(randInt(g, 1, 9))),
  (g) => B("÷", B("+", N(randInt(g, 1, 40)), N(randInt(g, 1, 40)), true), N(randInt(g, 2, 9))),
  (g) =>
    B(
      "−",
      B("+", N(randInt(g, 1, 30)), B("×", N(randInt(g, 2, 9)), N(randInt(g, 2, 9)))),
      N(randInt(g, 1, 20)),
    ),
  (g) => B("+", B("×", N(randInt(g, 2, 9)), N(randInt(g, 2, 9))), B("÷", N(randInt(g, 4, 81)), N(randInt(g, 2, 9)))),
];

function genM29(rng: Rng): MathQuestion {
  return retry(() => {
    const e = pick(rng, M29_PATTERNS)(rng);
    const v = evalExpr(e);
    if (v === null || v > 999) return null;
    const tokens = [...exprTokens(e), op("=")];
    return {
      level: "M29",
      tokens,
      kind: "int",
      value: rat(v),
      meta: { expr: tokens.map((t) => (t.t === "f" ? `${t.n}/${t.d}` : t.v)).join(" ") },
    } satisfies MathQuestion;
  });
}

// ---------- 一覧 ----------

export const GENERATORS: Record<string, (rng: Rng) => MathQuestion> = {
  M01: genM01,
  M02: genM02,
  M03: genM03,
  M04: genM04,
  M05: genM05,
  M06: genM06,
  M07: genM07,
  M08: genM08,
  M09: genM09,
  M10: genM10,
  M11: genM11,
  M12: genM12,
  M13: genM13,
  M14: genM14,
  M15: genM15,
  M16: genM16,
  M17: genM17,
  M18: genM18,
  M19: genM19,
  M20: genM20,
  M21: genM21,
  M22: genM22,
  M23: genM23,
  M24: genM24,
  M25: genM25,
  M26: genM26,
  M27: genM27,
  M28: genM28,
  M29: genM29,
};

export function generateQuestion(level: string, rng: Rng): MathQuestion {
  const g = GENERATORS[level];
  if (!g) throw new Error(`unknown level ${level}`);
  return g(rng);
}
