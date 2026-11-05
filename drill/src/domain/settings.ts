// 家族ごとの設定（family_settings.settings_json）。値が無ければ初期値を使う

export type Subject = "math" | "japanese" | "english";
export const SUBJECTS: readonly Subject[] = ["math", "japanese", "english"];
/** Phase 1 で使える教科（国語・英語は Phase 2/3 で追加） */
export const ENABLED_SUBJECTS: readonly Subject[] = ["math"];

export const SUBJECT_LABEL: Record<Subject, string> = {
  math: "さんすう",
  japanese: "こくご",
  english: "えいご",
};

export interface FamilySettings {
  /** 日の区切り（日本時間の時刻、0〜23） */
  dayBoundaryHour: number;
  /** お休み券の枚数（月あたり） */
  ticketsPerMonth: number;
  /** 進級：直近何回の学習で判定するか */
  promoteSessions: number;
  /** 進級：正答率の下限（0〜1） */
  promoteAccuracy: number;
  /** 復習：直近何回続けて */
  reviewSessions: number;
  /** 復習：正答率がこれ未満 */
  reviewAccuracy: number;
  /** 復習：前のレベルの問題を混ぜる割合 */
  reviewMixRatio: number;
  /** 1回の学習を判定に使うための最低回答数 */
  minEvalAnswers: number;
  /** 当て推量とみなす回答時間（ms 未満）教科ごと */
  guessThresholdMs: Record<Subject, number>;
  /** 操作がないときにタイマーを止めるまでの秒数 */
  idleSeconds: number;
}

export const DEFAULT_SETTINGS: FamilySettings = {
  dayBoundaryHour: 3,
  ticketsPerMonth: 5,
  promoteSessions: 3,
  promoteAccuracy: 0.9,
  reviewSessions: 2,
  reviewAccuracy: 0.7,
  reviewMixRatio: 0.3,
  minEvalAnswers: 5,
  guessThresholdMs: { math: 1000, japanese: 1000, english: 1000 },
  idleSeconds: 60,
};

function num(v: unknown, fallback: number, min: number, max: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/** DB の JSON を検証しつつ初期値とマージする（不正な値は初期値に戻す） */
export function parseSettings(json: string | null | undefined): FamilySettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = json ? JSON.parse(json) : {};
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }
  const d = DEFAULT_SETTINGS;
  const g = (raw.guessThresholdMs ?? {}) as Record<string, unknown>;
  return {
    dayBoundaryHour: Math.trunc(num(raw.dayBoundaryHour, d.dayBoundaryHour, 0, 23)),
    ticketsPerMonth: Math.trunc(num(raw.ticketsPerMonth, d.ticketsPerMonth, 0, 31)),
    promoteSessions: Math.trunc(num(raw.promoteSessions, d.promoteSessions, 1, 20)),
    promoteAccuracy: num(raw.promoteAccuracy, d.promoteAccuracy, 0, 1),
    reviewSessions: Math.trunc(num(raw.reviewSessions, d.reviewSessions, 1, 20)),
    reviewAccuracy: num(raw.reviewAccuracy, d.reviewAccuracy, 0, 1),
    reviewMixRatio: num(raw.reviewMixRatio, d.reviewMixRatio, 0, 1),
    minEvalAnswers: Math.trunc(num(raw.minEvalAnswers, d.minEvalAnswers, 1, 100)),
    guessThresholdMs: {
      math: num(g.math, d.guessThresholdMs.math, 0, 10000),
      japanese: num(g.japanese, d.guessThresholdMs.japanese, 0, 10000),
      english: num(g.english, d.guessThresholdMs.english, 0, 10000),
    },
    idleSeconds: Math.trunc(num(raw.idleSeconds, d.idleSeconds, 10, 600)),
  };
}
