// 親の画面用：その日の学習を「何を・何問・どれだけ正解したか」にまとめる（純粋関数）
import type { MathQuestion } from "./math/question";
import { mistakeCategory } from "./math/categories";
import { accuracy, type SessionEval } from "./progression";
import type { FamilySettings } from "./settings";

/** 問題を1行の文字にする（親の画面の一覧用） */
export function questionText(q: MathQuestion): string {
  if (q.rich) return q.rich.map((s) => (s.t === "text" ? s.v : s.t === "ruby" ? s.base : `［${s.v || s.rt}］`)).join("");
  if (q.kind === "order") return `${q.bigText ?? ""}（並べかえ）`;
  if (q.bigText) return q.bigText;
  if (q.speak) return `🔊「${q.speak}」`;
  return q.tokens.map((t) => (t.t === "f" ? `${t.n}/${t.d}` : t.v)).join(" ");
}

export interface AttemptRow {
  id: string;
  q: MathQuestion;
  answer: string;
  correctAnswer: string;
  isCorrect: boolean;
  isRetry: boolean;
  isGuess: boolean;
  retryOf: string | null;
}

export interface SubjectDayReport {
  /** 解いた問題数（間違い直しを除く） */
  answered: number;
  correct: number;
  wrong: number;
  /** まちがえた問題のうち、間違い直しで正解できた数 */
  fixed: number;
  /** 速すぎる回答（当て推量）の数 */
  guesses: number;
  /** 種類ごとの内訳（多い順） */
  categories: { name: string; answered: number; correct: number }[];
  /** まちがえた問題（出た順） */
  mistakes: { text: string; answer: string; correctAnswer: string; fixed: boolean }[];
}

export function subjectDayReport(attempts: readonly AttemptRow[]): SubjectDayReport {
  const first = attempts.filter((a) => !a.isRetry);
  const fixedIds = new Set(attempts.filter((a) => a.isRetry && a.isCorrect && a.retryOf).map((a) => a.retryOf!));
  const cats = new Map<string, { name: string; answered: number; correct: number }>();
  for (const a of first) {
    // 「M07 たし算」→「たし算」（レベルは見出しに出すので省く）
    const name = mistakeCategory(a.q).replace(/^[A-Z]\d+\s*/, "") || "問題";
    const c = cats.get(name) ?? { name, answered: 0, correct: 0 };
    c.answered++;
    if (a.isCorrect) c.correct++;
    cats.set(name, c);
  }
  const wrong = first.filter((a) => !a.isCorrect);
  return {
    answered: first.length,
    correct: first.length - wrong.length,
    wrong: wrong.length,
    fixed: wrong.filter((a) => fixedIds.has(a.id)).length,
    guesses: first.filter((a) => a.isGuess).length,
    categories: [...cats.values()].sort((a, b) => b.answered - a.answered),
    mistakes: wrong.map((a) => ({ text: questionText(a.q), answer: a.answer, correctAnswer: a.correctAnswer, fixed: fixedIds.has(a.id) })),
  };
}

export interface PromotionCheck {
  /** 判定に使える回か（回答が少なすぎる回は使わない） */
  eligible: boolean;
  accuracyOk: boolean;
  speedOk: boolean;
  pass: boolean;
  accuracyPct: number;
  avgSeconds: number | null;
}

export interface PromotionProgress {
  /** 直近の回（新しい順、最大 promoteSessions 回ぶん） */
  checks: PromotionCheck[];
  /** 進級に必要な回数 */
  needed: number;
  /** 直近から続けてクリアしている回数 */
  streak: number;
  targetSeconds: number;
  accuracyPct: number;
}

/** 進級までの様子：今のレベルでの直近の回が、正答率と速さの条件をクリアしているか */
export function promotionProgress(
  recent: readonly SessionEval[],
  targetMs: number,
  s: Pick<FamilySettings, "promoteSessions" | "promoteAccuracy" | "minEvalAnswers">,
): PromotionProgress {
  const checks = recent
    .filter((e) => e.total >= s.minEvalAnswers)
    .slice(0, s.promoteSessions)
    .map((e): PromotionCheck => {
      const accuracyOk = accuracy(e) >= s.promoteAccuracy;
      const speedOk = e.avgMs !== null && e.avgMs <= targetMs;
      return {
        eligible: true,
        accuracyOk,
        speedOk,
        pass: accuracyOk && speedOk,
        accuracyPct: Math.round(accuracy(e) * 100),
        avgSeconds: e.avgMs === null ? null : Math.round(e.avgMs / 100) / 10,
      };
    });
  let streak = 0;
  for (const c of checks) {
    if (!c.pass) break;
    streak++;
  }
  return { checks, needed: s.promoteSessions, streak, targetSeconds: targetMs / 1000, accuracyPct: Math.round(s.promoteAccuracy * 100) };
}
