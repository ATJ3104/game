import { describe, expect, it } from "vitest";
import { GENERATORS, generateQuestion, hasBorrow, hasCarry } from "@/domain/math/generators";
import { MATH_LEVELS, nextMathLevel, prevMathLevel } from "@/domain/math/levels";
import { seededRng } from "@/domain/math/rng";
import { add, div, eq, gcd, isInt, mul, parseDecimal, rat, sub, toDecimalString, type Rational } from "@/domain/math/rational";
import type { MathQuestion } from "@/domain/math/question";
import { answerText, grade, parseAnswerInput } from "@/domain/math/answer";

const N = 400;

function sample(level: string, n = N, seed = 42): MathQuestion[] {
  const rng = seededRng(seed);
  return Array.from({ length: n }, () => generateQuestion(level, rng));
}

const digits = (x: number) => String(x).length;
const intVal = (q: MathQuestion) => {
  expect(q.kind).toBe("int");
  expect(q.value!.d).toBe(1);
  return q.value!.n;
};
const nums = (q: MathQuestion) => ({ a: q.meta.a as number, b: q.meta.b as number, op: q.meta.op as string });
const parseFrac = (s: string): Rational => {
  const [n, d] = s.split("/").map(Number) as [number, number];
  return rat(n, d);
};

describe("レベル表", () => {
  it("M01〜M29 がそろっていて、すべてに生成器と目標時間がある", () => {
    expect(MATH_LEVELS.map((l) => l.code)).toEqual(Array.from({ length: 29 }, (_, i) => `M${String(i + 1).padStart(2, "0")}`));
    for (const l of MATH_LEVELS) {
      expect(GENERATORS[l.code]).toBeTypeOf("function");
      expect(l.targetMs).toBeGreaterThan(0);
    }
    expect(prevMathLevel("M01")).toBeNull();
    expect(prevMathLevel("M02")).toBe("M01");
    expect(nextMathLevel("M29")).toBeNull();
  });

  it("どのレベルも、生成した問題は自分自身の答えで正解になる", () => {
    for (const l of MATH_LEVELS) {
      for (const q of sample(l.code, 100, 7)) {
        expect(q.level).toBe(l.code);
        let input;
        if (q.kind === "qr") input = { kind: "qr" as const, q: String(q.qr!.q), r: String(q.qr!.r) };
        else if (q.kind === "fraction") input = { kind: "fraction" as const, num: String(q.value!.n), den: String(q.value!.d) };
        else if (q.kind === "decimal") input = { kind: "decimal" as const, value: toDecimalString(q.value!)! };
        else input = { kind: "int" as const, value: String(q.value!.n) };
        if (q.kind === "fraction" && q.value!.d === 1) input = { kind: "fraction" as const, whole: String(q.value!.n) };
        expect(grade(q, input).correct).toBe(true);
      }
    }
  });

  it("答えは負にならない", () => {
    for (const l of MATH_LEVELS) {
      for (const q of sample(l.code, 100, 11)) {
        if (q.value) expect(q.value.n).toBeGreaterThanOrEqual(0);
        if (q.qr) expect(q.qr.q).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("整数のたし算・ひき算", () => {
  it("M01 10までのたし算", () => {
    for (const q of sample("M01")) {
      const { a, b, op } = nums(q);
      expect(op).toBe("+");
      expect(a + b).toBeLessThanOrEqual(10);
      expect(a + b).toBeGreaterThan(0);
      expect(intVal(q)).toBe(a + b);
    }
  });
  it("M02 10までのひき算", () => {
    for (const q of sample("M02")) {
      const { a, b, op } = nums(q);
      expect(op).toBe("−");
      expect(a).toBeLessThanOrEqual(10);
      expect(intVal(q)).toBe(a - b);
      expect(a - b).toBeGreaterThanOrEqual(0);
    }
  });
  it("M03 くり上がりのあるたし算（20まで）", () => {
    for (const q of sample("M03")) {
      const { a, b } = nums(q);
      expect(digits(a)).toBe(1);
      expect(digits(b)).toBe(1);
      expect(a + b).toBeGreaterThanOrEqual(10);
      expect(a + b).toBeLessThanOrEqual(20);
      expect(hasCarry(a, b)).toBe(true);
      expect(intVal(q)).toBe(a + b);
    }
  });
  it("M04 くり下がりのあるひき算（20まで）", () => {
    for (const q of sample("M04")) {
      const { a, b } = nums(q);
      expect(a).toBeGreaterThan(10);
      expect(a).toBeLessThanOrEqual(20);
      expect(digits(b)).toBe(1);
      expect(hasBorrow(a, b)).toBe(true);
      expect(intVal(q)).toBe(a - b);
    }
  });
  it("M05 2けた±1けた（たし算・ひき算の両方が出る）", () => {
    const qs = sample("M05");
    const ops = new Set(qs.map((q) => q.meta.op));
    expect(ops).toEqual(new Set(["+", "−"]));
    for (const q of qs) {
      const { a, b, op } = nums(q);
      expect(digits(a)).toBe(2);
      expect(digits(b)).toBe(1);
      expect(intVal(q)).toBe(op === "+" ? a + b : a - b);
      if (op === "+") expect(a + b).toBeLessThanOrEqual(99);
    }
  });
  it("M06 2けた±2けた（くり上がり・くり下がりなし）", () => {
    const qs = sample("M06");
    expect(new Set(qs.map((q) => q.meta.op))).toEqual(new Set(["+", "−"]));
    for (const q of qs) {
      const { a, b, op } = nums(q);
      expect(digits(a)).toBe(2);
      expect(digits(b)).toBe(2);
      if (op === "+") {
        expect(hasCarry(a, b)).toBe(false);
        expect(intVal(q)).toBe(a + b);
      } else {
        expect(hasBorrow(a, b)).toBe(false);
        expect(intVal(q)).toBe(a - b);
      }
    }
  });
  it("M07 2けた±2けた（くり上がり・くり下がりあり）", () => {
    const qs = sample("M07");
    expect(new Set(qs.map((q) => q.meta.op))).toEqual(new Set(["+", "−"]));
    for (const q of qs) {
      const { a, b, op } = nums(q);
      expect(digits(a)).toBe(2);
      expect(digits(b)).toBe(2);
      if (op === "+") {
        expect(hasCarry(a, b)).toBe(true);
        expect(intVal(q)).toBe(a + b);
      } else {
        expect(hasBorrow(a, b)).toBe(true);
        expect(intVal(q)).toBe(a - b);
        expect(a - b).toBeGreaterThan(0);
      }
    }
  });
  it("M08 3けたのたし算・ひき算", () => {
    for (const q of sample("M08")) {
      const { a, b, op } = nums(q);
      expect(digits(a)).toBe(3);
      expect(digits(b)).toBe(3);
      expect(intVal(q)).toBe(op === "+" ? a + b : a - b);
      expect(intVal(q)).toBeLessThanOrEqual(999);
    }
  });
});

describe("かけ算・わり算", () => {
  it("M09 九九（2・5・3・4の段）すべての段が出る", () => {
    const qs = sample("M09");
    expect(new Set(qs.map((q) => q.meta.dan))).toEqual(new Set([2, 5, 3, 4]));
    for (const q of qs) {
      const { a, b } = nums(q);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(9);
      expect(intVal(q)).toBe(a * b);
    }
  });
  it("M10 九九（6・7・8・9・1の段）", () => {
    const qs = sample("M10");
    expect(new Set(qs.map((q) => q.meta.dan))).toEqual(new Set([6, 7, 8, 9, 1]));
    for (const q of qs) expect(intVal(q)).toBe(nums(q).a * nums(q).b);
  });
  it("M11 九九ランダム（1〜9の段）", () => {
    const qs = sample("M11", 1000);
    expect(new Set(qs.map((q) => q.meta.dan)).size).toBe(9);
    for (const q of qs) expect(intVal(q)).toBe(nums(q).a * nums(q).b);
  });
  it("M12 わり算（九九の逆、あまりなし）", () => {
    for (const q of sample("M12")) {
      const { a, b, op } = nums(q);
      expect(op).toBe("÷");
      expect(a % b).toBe(0);
      expect(a / b).toBeLessThanOrEqual(9);
      expect(intVal(q)).toBe(a / b);
    }
  });
  it("M13 あまりのあるわり算（必ずあまりがある、あまり < わる数）", () => {
    for (const q of sample("M13")) {
      const { a, b } = nums(q);
      expect(q.kind).toBe("qr");
      expect(q.qr!.r).toBeGreaterThan(0);
      expect(q.qr!.r).toBeLessThan(b);
      expect(q.qr!.q * b + q.qr!.r).toBe(a);
      expect(q.qr!.q).toBeLessThanOrEqual(9);
    }
  });
  it("M14 2けた×1けた / M15 3けた×1けた / M16 2けた×2けた", () => {
    for (const [lv, da, db] of [
      ["M14", 2, 1],
      ["M15", 3, 1],
      ["M16", 2, 2],
    ] as const) {
      for (const q of sample(lv)) {
        const { a, b, op } = nums(q);
        expect(op).toBe("×");
        expect(digits(a)).toBe(da);
        expect(digits(b)).toBe(db);
        expect(intVal(q)).toBe(a * b);
      }
    }
  });
  it("M17 2けた÷1けた（商は2けた、あまりあり・なし両方）", () => {
    const qs = sample("M17");
    expect(qs.some((q) => q.qr!.r === 0)).toBe(true);
    expect(qs.some((q) => q.qr!.r > 0)).toBe(true);
    for (const q of qs) {
      const { a, b } = nums(q);
      expect(digits(a)).toBe(2);
      expect(digits(b)).toBe(1);
      expect(q.qr!.q).toBe(Math.floor(a / b));
      expect(q.qr!.r).toBe(a % b);
      expect(q.qr!.q).toBeGreaterThanOrEqual(10);
    }
  });
  it("M18 3けた÷1けた（あまりあり・なし両方）", () => {
    const qs = sample("M18");
    expect(qs.some((q) => q.qr!.r === 0)).toBe(true);
    expect(qs.some((q) => q.qr!.r > 0)).toBe(true);
    for (const q of qs) {
      const { a, b } = nums(q);
      expect(digits(a)).toBe(3);
      expect(digits(b)).toBe(1);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(q.qr!.q * b + q.qr!.r).toBe(a);
      expect(q.qr!.r).toBeLessThan(b);
    }
  });
  it("M19 ÷2けた", () => {
    const qs = sample("M19");
    expect(qs.some((q) => q.qr!.r === 0)).toBe(true);
    expect(qs.some((q) => q.qr!.r > 0)).toBe(true);
    for (const q of qs) {
      const { a, b } = nums(q);
      expect(digits(b)).toBe(2);
      expect(a).toBeGreaterThanOrEqual(b);
      expect(a).toBeLessThanOrEqual(999);
      expect(q.qr!.q * b + q.qr!.r).toBe(a);
      expect(q.qr!.r).toBeLessThan(b);
    }
  });
});

describe("小数", () => {
  const decOf = (v: unknown) => parseDecimal(String(v))!;
  it("M20 小数のたし算・ひき算（少なくとも小数をふくむ・答えは正）", () => {
    for (const q of sample("M20")) {
      expect(q.kind).toBe("decimal");
      const a = decOf(q.meta.a);
      const b = decOf(q.meta.b);
      expect(isInt(a)).toBe(false);
      expect(isInt(b)).toBe(false);
      const expected = q.meta.op === "+" ? add(a, b) : sub(a, b);
      expect(eq(q.value!, expected)).toBe(true);
      expect(q.value!.n).toBeGreaterThan(0);
      expect(toDecimalString(q.value!)).not.toBeNull();
    }
  });
  it("M21 小数×整数、小数÷整数（わり切れる）", () => {
    const qs = sample("M21");
    expect(new Set(qs.map((q) => q.meta.op))).toEqual(new Set(["×", "÷"]));
    for (const q of qs) {
      const a = decOf(q.meta.a);
      const b = q.meta.b as number;
      expect(Number.isInteger(b)).toBe(true);
      expect(isInt(a)).toBe(false);
      const expected = q.meta.op === "×" ? mul(a, rat(b)) : div(a, rat(b));
      expect(eq(q.value!, expected)).toBe(true);
      expect(toDecimalString(q.value!)).not.toBeNull();
    }
  });
  it("M25 小数×小数", () => {
    for (const q of sample("M25")) {
      const a = decOf(q.meta.a);
      const b = decOf(q.meta.b);
      expect(isInt(a) || isInt(b)).toBe(false);
      expect(eq(q.value!, mul(a, b))).toBe(true);
    }
  });
  it("M26 小数÷小数（わる数は小数、答えはわり切れる）", () => {
    for (const q of sample("M26")) {
      const a = decOf(q.meta.a);
      const b = decOf(q.meta.b);
      expect(isInt(b)).toBe(false);
      expect(eq(q.value!, div(a, b))).toBe(true);
      expect(toDecimalString(q.value!)).not.toBeNull();
    }
  });
});

describe("分数", () => {
  it("M22 同じ分母（未約分でも〇）", () => {
    for (const q of sample("M22")) {
      expect(q.fractionRule).toBe("value");
      const d = q.meta.den as number;
      const x = q.meta.aNum as number;
      const y = q.meta.bNum as number;
      expect(x).toBeLessThan(d);
      expect(y).toBeLessThan(d);
      const t = q.tokens;
      expect(t[0]).toEqual({ t: "f", n: String(x), d: String(d) });
      expect(t[2]).toEqual({ t: "f", n: String(y), d: String(d) });
      expect(eq(q.value!, rat(q.meta.op === "+" ? x + y : x - y, d))).toBe(true);
      expect(q.value!.n).toBeGreaterThan(0);
    }
  });
  it("M23 約分（既約のみ〇）と通分（□の分子）", () => {
    const qs = sample("M23");
    expect(new Set(qs.map((q) => q.meta.type))).toEqual(new Set(["reduce", "expand"]));
    for (const q of qs) {
      if (q.meta.type === "reduce") {
        const n = q.meta.n as number;
        const d = q.meta.d as number;
        expect(gcd(n, d)).toBeGreaterThan(1); // 約分できる分数が出る
        expect(eq(q.value!, rat(n, d))).toBe(true);
        expect(q.fractionRule).toBe("reduced");
      } else {
        const n = q.meta.n as number;
        const d = q.meta.d as number;
        const nd = q.meta.newDen as number;
        expect(nd % d).toBe(0);
        expect(nd).toBeGreaterThan(d);
        expect(intVal(q)).toBe((n * nd) / d);
      }
    }
  });
  it("M24 ちがう分母（約分まで必須）", () => {
    for (const q of sample("M24")) {
      expect(q.fractionRule).toBe("reduced");
      expect(q.meta.aDen).not.toBe(q.meta.bDen);
      const a = parseFrac(q.meta.a as string);
      const b = parseFrac(q.meta.b as string);
      expect(eq(q.value!, q.meta.op === "+" ? add(a, b) : sub(a, b))).toBe(true);
      expect(q.value!.n).toBeGreaterThan(0);
    }
  });
  it("M27 分数×分数 / M28 分数÷分数", () => {
    for (const q of sample("M27")) {
      expect(eq(q.value!, mul(parseFrac(q.meta.a as string), parseFrac(q.meta.b as string)))).toBe(true);
      expect(q.fractionRule).toBe("reduced");
    }
    for (const q of sample("M28")) {
      expect(eq(q.value!, div(parseFrac(q.meta.a as string), parseFrac(q.meta.b as string)))).toBe(true);
      expect(q.fractionRule).toBe("reduced");
    }
  });
});

describe("M29 計算の順序", () => {
  /** 表示されたトークン列を、かけ算・わり算優先・かっこ優先で計算する独立した実装 */
  function evaluateTokens(tokens: string[]): number {
    let i = 0;
    const peek = () => tokens[i];
    const factor = (): number => {
      const t = tokens[i++]!;
      if (t === "(") {
        const v = expr();
        i++; // ")"
        return v;
      }
      return Number(t);
    };
    const term = (): number => {
      let v = factor();
      while (peek() === "×" || peek() === "÷") {
        const o = tokens[i++];
        const r = factor();
        v = o === "×" ? v * r : v / r;
      }
      return v;
    };
    const expr = (): number => {
      let v = term();
      while (peek() === "+" || peek() === "−") {
        const o = tokens[i++];
        const r = term();
        v = o === "+" ? v + r : v - r;
      }
      return v;
    };
    return expr();
  }

  it("表示どおりに四則の順序で計算した値が答えと一致し、整数・0以上", () => {
    const qs = sample("M29", 1000);
    expect(qs.some((q) => q.tokens.some((t) => t.t === "op" && t.v === "("))).toBe(true);
    for (const q of qs) {
      const toks = q.tokens.filter((t) => !(t.t === "op" && t.v === "=")).map((t) => (t.t === "f" ? "" : t.v));
      expect(evaluateTokens(toks)).toBe(intVal(q));
      expect(intVal(q)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("採点", () => {
  const fracQ = (n: number, d: number, rule: "value" | "reduced"): MathQuestion => ({
    level: "T",
    tokens: [],
    kind: "fraction",
    value: rat(n, d),
    fractionRule: rule,
    meta: {},
  });
  const F = (num?: string, den?: string, whole?: string) => ({ kind: "fraction" as const, num, den, whole });

  it("M22 型（value）：未約分でも〇、ただし「約分できる」と伝える", () => {
    const q = fracQ(2, 3, "value");
    expect(grade(q, F("2", "3"))).toEqual({ correct: true });
    expect(grade(q, F("4", "6"))).toEqual({ correct: true, feedback: "can_reduce" });
    expect(grade(q, F("3", "4")).correct).toBe(false);
  });
  it("reduced：未約分は × で「あと約分」", () => {
    const q = fracQ(2, 3, "reduced");
    expect(grade(q, F("2", "3"))).toEqual({ correct: true });
    expect(grade(q, F("4", "6"))).toEqual({ correct: false, feedback: "reduce" });
  });
  it("reduced：仮分数・帯分数どちらでも既約なら〇", () => {
    const q = fracQ(7, 4, "reduced");
    expect(grade(q, F("7", "4")).correct).toBe(true);
    expect(grade(q, F("3", "4", "1")).correct).toBe(true);
    expect(grade(q, F("6", "8", "1"))).toEqual({ correct: false, feedback: "reduce" });
    expect(grade(q, F("7", "4", "0")).correct).toBe(true);
  });
  it("reduced：帯分数の分数部分が仮分数なら約分しきっていない扱い", () => {
    const q = fracQ(11, 4, "reduced");
    expect(grade(q, F("7", "4", "1"))).toEqual({ correct: false, feedback: "reduce" });
  });
  it("reduced：答えが整数なら整数で（2/1 は未約分扱い）", () => {
    const q = fracQ(2, 1, "reduced");
    expect(grade(q, F(undefined, undefined, "2")).correct).toBe(true);
    expect(grade(q, F("2", "1"))).toEqual({ correct: false, feedback: "reduce" });
    expect(grade(q, F("4", "2"))).toEqual({ correct: false, feedback: "reduce" });
  });
  it("分数の入力が不完全・分母0は無効", () => {
    const q = fracQ(1, 2, "value");
    expect(grade(q, F("1", "")).invalid).toBe(true);
    expect(grade(q, F("1", "0")).invalid).toBe(true);
    expect(grade(q, F()).invalid).toBe(true);
  });
  it("小数：0.50 も 0.5 も〇、.5 も〇、整数の答えは整数でも〇", () => {
    const q: MathQuestion = { level: "T", tokens: [], kind: "decimal", value: rat(1, 2), meta: {} };
    expect(grade(q, { kind: "decimal", value: "0.5" }).correct).toBe(true);
    expect(grade(q, { kind: "decimal", value: "0.50" }).correct).toBe(true);
    expect(grade(q, { kind: "decimal", value: ".5" }).correct).toBe(true);
    expect(grade(q, { kind: "decimal", value: "5" }).correct).toBe(false);
    expect(grade(q, { kind: "decimal", value: "0..5" }).invalid).toBe(true);
    const q2: MathQuestion = { level: "T", tokens: [], kind: "decimal", value: rat(3), meta: {} };
    expect(grade(q2, { kind: "decimal", value: "3" }).correct).toBe(true);
    expect(grade(q2, { kind: "decimal", value: "3.0" }).correct).toBe(true);
  });
  it("小数の計算で浮動小数点の誤差が出ない（0.1 + 0.2 = 0.3）", () => {
    expect(toDecimalString(add(rat(1, 10), rat(2, 10)))).toBe("0.3");
    expect(toDecimalString(mul(rat(12, 10), rat(3, 10)))).toBe("0.36");
  });
  it("あまり：商とあまりの両方が合って〇、あまり0は空欄でもよい", () => {
    const q: MathQuestion = { level: "T", tokens: [], kind: "qr", qr: { q: 7, r: 2 }, meta: {} };
    expect(grade(q, { kind: "qr", q: "7", r: "2" }).correct).toBe(true);
    expect(grade(q, { kind: "qr", q: "7", r: "" }).correct).toBe(false);
    expect(grade(q, { kind: "qr", q: "6", r: "9" }).correct).toBe(false);
    const q0: MathQuestion = { level: "T", tokens: [], kind: "qr", qr: { q: 7, r: 0 }, meta: {} };
    expect(grade(q0, { kind: "qr", q: "7", r: "" }).correct).toBe(true);
    expect(grade(q0, { kind: "qr", q: "7", r: "0" }).correct).toBe(true);
  });
  it("整数：数字以外は無効", () => {
    const q: MathQuestion = { level: "T", tokens: [], kind: "int", value: rat(12), meta: {} };
    expect(grade(q, { kind: "int", value: "12" }).correct).toBe(true);
    expect(grade(q, { kind: "int", value: "1e1" }).invalid).toBe(true);
    expect(grade(q, { kind: "int", value: "-12" }).invalid).toBe(true);
    expect(grade(q, { kind: "decimal", value: "12" }).invalid).toBe(true);
  });
  it("答えの表示", () => {
    expect(answerText(fracQ(7, 4, "reduced"))).toBe("7/4（1と3/4）");
    expect(answerText({ level: "T", tokens: [], kind: "qr", qr: { q: 7, r: 2 }, meta: {} })).toBe("7 あまり 2");
  });
  it("端末からの入力の検証", () => {
    expect(parseAnswerInput({ kind: "int", value: "3" })).toEqual({ kind: "int", value: "3" });
    expect(parseAnswerInput({ kind: "int", value: 3 })).toBeNull();
    expect(parseAnswerInput({ kind: "x" })).toBeNull();
    expect(parseAnswerInput(null)).toBeNull();
  });
});
