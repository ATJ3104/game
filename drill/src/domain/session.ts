// 学習の流れ（純粋関数）：時間の加算、当て推量、間違い直しの順番、次の段階

export type SessionStatus = "studying" | "retry" | "done";

/**
 * 端末から報告された「実際に解いていた時間」を、サーバーで確認できる経過時間で切り詰める。
 * （端末の時計や改ざんで時間が水増しされないように）
 */
export function clampActiveMs(reportedMs: unknown, lastReportAt: string | null, now: Date, slackMs = 2000): number {
  const r = typeof reportedMs === "number" && Number.isFinite(reportedMs) ? Math.max(0, reportedMs) : 0;
  if (!lastReportAt) return 0;
  const elapsed = now.getTime() - Date.parse(lastReportAt);
  return Math.max(0, Math.min(r, elapsed + slackMs));
}

/** 回答時間：端末の計測値を使うが、サーバーで見た表示からの経過時間を上限にする */
export function clampResponseMs(reportedMs: unknown, shownAt: string | null, now: Date): number {
  const serverMs = shownAt ? Math.max(0, now.getTime() - Date.parse(shownAt)) : 0;
  const r = typeof reportedMs === "number" && Number.isFinite(reportedMs) && reportedMs >= 0 ? reportedMs : serverMs;
  return Math.round(Math.min(r, serverMs + 1000, 30 * 60 * 1000));
}

export function isGuess(responseMs: number, thresholdMs: number): boolean {
  return responseMs < thresholdMs;
}

/**
 * その教科で解く問題数。「目標時間（分）で終わる想定の問題数」を、レベルの目標解答時間から決める。
 * 1問あたり「目標の平均解答時間 × 1.5 ＋ 〇×の表示などの 2秒」かかる想定（目標より少しゆっくりでも時間内に終わる数）
 */
export function questionQuota(targetSeconds: number, levelTargetMs: number): number {
  const perQuestionMs = levelTargetMs * 1.5 + 2000;
  return Math.max(5, Math.min(200, Math.round((targetSeconds * 1000) / perQuestionMs)));
}

/**
 * 問題数に数える回答か。間違い直しは数えない。
 * 「速すぎる まちがい」（当て推量）も数えない（でたらめに連打しても進まないように）
 */
export function countsTowardQuota(a: { isRetry: boolean; isCorrect: boolean; isGuess: boolean }): boolean {
  return !a.isRetry && (a.isCorrect || !a.isGuess);
}

/**
 * 回答した後の段階。
 * - 学習中：決まった問題数を解いたら間違い直しへ。直すものがなければ完了
 *   （時間がたつだけでは終わらない。時間は記録用）
 * - 間違い直し中：全部正解したら完了
 */
export function nextStatus(p: {
  status: SessionStatus;
  answered: number;
  targetQuestions: number;
  pendingRetries: number;
}): SessionStatus {
  if (p.status === "done") return "done";
  if (p.status === "studying" && p.answered < p.targetQuestions) return "studying";
  return p.pendingRetries > 0 ? "retry" : "done";
}

export interface OriginalWrong {
  id: string;
  createdAt: string;
}
export interface RetryAttempt {
  retryOf: string;
  isCorrect: boolean;
  createdAt: string;
}

/**
 * まだ直せていない問題（間違い直しで一度も正解していないもの）を、
 * 最後に出した時刻が古い順に並べる（さっき間違えた問題がすぐにまた出ないように）
 */
export function pendingRetries(originals: readonly OriginalWrong[], retries: readonly RetryAttempt[]): string[] {
  const solved = new Set(retries.filter((r) => r.isCorrect).map((r) => r.retryOf));
  const lastShown = new Map<string, string>();
  for (const o of originals) lastShown.set(o.id, o.createdAt);
  for (const r of retries) {
    const prev = lastShown.get(r.retryOf);
    if (prev !== undefined && r.createdAt > prev) lastShown.set(r.retryOf, r.createdAt);
  }
  return originals
    .filter((o) => !solved.has(o.id))
    .sort((a, b) => (lastShown.get(a.id)! < lastShown.get(b.id)! ? -1 : lastShown.get(a.id)! > lastShown.get(b.id)! ? 1 : 0))
    .map((o) => o.id);
}
