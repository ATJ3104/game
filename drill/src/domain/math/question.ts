import type { Rational } from "./rational";

// 問題の型（算数・国語で共通。算数から始まったのでファイルは math/ にある）

/** 算数の問題の表示部品 */
export type Token =
  | { t: "n"; v: string } // 数（整数・小数）
  | { t: "f"; n: string; d: string } // 分数（n が "□" のときは空欄）
  | { t: "op"; v: "+" | "−" | "×" | "÷" | "=" | "(" | ")" };

/**
 * 国語の文の部品
 * - text: そのまま表示（ひらがな・カタカナ・記号）
 * - ruby: 漢字とその読み（子どもの設定で「漢字のまま／ふりがな／ひらがな」に切りかえる）
 * - target: 問題の部分（v = 漢字の表記、rt = 読み）。出題の形によって片方だけを端末に送る
 */
export type Segment =
  | { t: "text"; v: string }
  | { t: "ruby"; base: string; rt: string }
  | { t: "target"; v: string; rt: string };

/**
 * 答えの入力形式
 * - int: 整数（テンキー）
 * - decimal: 小数（テンキー＋小数点）
 * - fraction: 分数（整数部〔帯分数用・省略可〕・分子・分母）
 * - qr: 商とあまり
 * - choice: 選択肢（国語・英語）
 * - order: 単語カードの並べかえ（英語のフレーズ）
 */
export type AnswerKind = "int" | "decimal" | "fraction" | "qr" | "choice" | "order";

/**
 * 分数の答えの扱い
 * - value: 値が等しければ正解（約分していなくてもよい）
 * - reduced: 約分しきった形（既約の仮分数／帯分数、整数になるときは整数）だけ正解
 */
export type FractionRule = "value" | "reduced";

/** 選択肢の見せ方 */
export type ChoiceStyle = "kana" | "reading" | "kanji" | "emoji" | "en" | "meaning" | "phrase";

export interface MathQuestion {
  level: string;
  /** 問題文（「やくぶん しましょう」など。なければ式だけ） */
  prompt?: string;
  /** 算数の式 */
  tokens: Token[];
  kind: AnswerKind;
  /** int / decimal / fraction の答え */
  value?: Rational;
  /** qr の答え */
  qr?: { q: number; r: number };
  fractionRule?: FractionRule;

  // ---- 選択肢の問題（国語） ----
  /** 文（例文）。target の見せ方は targetMode で決める */
  rich?: Segment[];
  /** show_kanji: 漢字を見せて読みを選ぶ／show_reading: 読みを見せて漢字を選ぶ */
  targetMode?: "show_kanji" | "show_reading";
  /** 大きく見せる1文字（かな） */
  bigText?: string;
  /** 大きく見せる文字の大きさ（1文字なら huge、単語なら large、文なら medium） */
  bigTextSize?: "huge" | "large" | "medium";
  /** 読み上げる文字列。あれば「きく」ボタンを出し、問題を出したときにも読み上げる */
  speak?: string;
  /** 読み上げの言語（省略時は日本語） */
  speakLang?: "ja-JP" | "en-US";
  choices?: string[];
  choiceStyle?: ChoiceStyle;
  /** 正解の選択肢の番号（サーバーだけが持つ） */
  answerChoice?: number;

  // ---- 並べかえの問題（英語） ----
  /** 並べかえるカード（ばらばらの順） */
  tiles?: string[];
  /** 正しい順の単語（サーバーだけが持つ） */
  answerTokens?: string[];

  /** テスト・分析用の情報（演算の種類やオペランド） */
  meta: Record<string, number | string | boolean>;
}

/** 教科共通の呼び名 */
export type Question = MathQuestion;

/** 子どもの端末に送る形（答えと meta を含めない） */
export interface PublicQuestion {
  prompt?: string;
  tokens: Token[];
  kind: AnswerKind;
  /** 分数の答えで帯分数欄を出すか */
  allowMixed?: boolean;
  rich?: Segment[];
  bigText?: string;
  bigTextSize?: "huge" | "large" | "medium";
  speak?: string;
  speakLang?: "ja-JP" | "en-US";
  choices?: string[];
  choiceStyle?: ChoiceStyle;
  tiles?: string[];
}

/** 端末に送る文。答えになる側（読み or 漢字）を消してから送る */
function publicRich(q: MathQuestion): Segment[] | undefined {
  if (!q.rich) return undefined;
  return q.rich.map((s) =>
    s.t !== "target" ? s : q.targetMode === "show_reading" ? { t: "target", v: "", rt: s.rt } : { t: "target", v: s.v, rt: "" },
  );
}

export function toPublic(q: MathQuestion): PublicQuestion {
  return {
    prompt: q.prompt,
    tokens: q.tokens,
    kind: q.kind,
    allowMixed: q.kind === "fraction" ? true : undefined,
    rich: publicRich(q),
    bigText: q.bigText,
    bigTextSize: q.bigTextSize,
    speak: q.speak,
    speakLang: q.speakLang,
    choices: q.choices,
    choiceStyle: q.choiceStyle,
    tiles: q.tiles,
  };
}

/** 同じ問題の連続を避けるためのキー */
export function questionKey(q: MathQuestion): string {
  return JSON.stringify([q.prompt ?? "", q.tokens, q.rich ?? null, q.bigText ?? "", q.speak ?? "", q.targetMode ?? ""]);
}
