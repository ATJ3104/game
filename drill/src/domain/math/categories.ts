import type { MathQuestion } from "./question";

const OP_NAME: Record<string, string> = { "+": "たし算", "−": "ひき算", "×": "かけ算", "÷": "わり算" };

const JA_TYPE: Record<string, string> = { read: "読み", write: "漢字えらび", listen: "聞き取り", picture: "文字と絵" };
const EN_TYPE: Record<string, string> = { case: "大文字・小文字", listen: "聞き取り", en2ja: "英語→意味", ja2en: "意味→英語", order: "並べかえ" };

/** 「よく間違える問題の種類」の分類（算数：レベル＋演算、国語：レベル＋出題の形） */
export function mistakeCategory(q: MathQuestion): string {
  if (q.level.startsWith("E")) return `${q.level} ${EN_TYPE[String(q.meta.type)] ?? ""}`.trim();
  if (q.level.startsWith("K")) return `${q.level} ${JA_TYPE[String(q.meta.type)] ?? ""}`.trim();
  if (q.level === "M23") return `${q.level} ${q.meta.type === "reduce" ? "約分" : "通分"}`;
  if (q.level === "M29") return `${q.level} 計算の順序`;
  if (typeof q.meta.dan === "number") return `${q.level} ${q.meta.dan}の段`;
  const op = typeof q.meta.op === "string" ? OP_NAME[q.meta.op] : undefined;
  return op ? `${q.level} ${op}` : q.level;
}

export interface MistakeStat {
  category: string;
  total: number;
  wrong: number;
  examples: string[];
}

/** 1回目の回答（間違い直しを除く）から、間違いの多い種類を集計する */
export function mistakeStats(
  attempts: readonly { q: MathQuestion; isCorrect: boolean; text: string }[],
  minTotal = 3,
): MistakeStat[] {
  const map = new Map<string, MistakeStat>();
  for (const a of attempts) {
    const c = mistakeCategory(a.q);
    const s = map.get(c) ?? { category: c, total: 0, wrong: 0, examples: [] };
    s.total++;
    if (!a.isCorrect) {
      s.wrong++;
      if (s.examples.length < 3) s.examples.push(a.text);
    }
    map.set(c, s);
  }
  return [...map.values()]
    .filter((s) => s.wrong > 0 && s.total >= minTotal)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong);
}
