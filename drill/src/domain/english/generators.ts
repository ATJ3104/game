// 英語の問題生成
import type { Question } from "../math/question";
import { chance, pick, type Rng } from "../math/rng";
import { shuffle } from "../japanese/generators";
import { getEnglishLevel } from "./levels";
import { phraseTokens } from "./validate";
import type { EnglishWord } from "./content";

export interface EnglishGenOptions {
  /** 端末で英語（en-US）の読み上げが使えるか */
  canSpeak: boolean;
}

export const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 形が似ていてまちがえやすい小文字 */
const LOWER_CONFUSABLE = ["bdpq", "mnhu", "uvwy", "ijlt", "aoec", "fkt", "gqy", "rnm", "sz", "xk"];
/** 音が似ていてまちがえやすい大文字 */
const SOUND_CONFUSABLE = ["BDEGPTVZC", "AJKH", "MN", "IY", "QUW", "FSX", "LR", "O"];

function withChoices(rng: Rng, answer: string, wrong: readonly string[]): { choices: string[]; answerChoice: number } {
  const choices = shuffle(rng, [answer, ...wrong.slice(0, 3)]);
  return { choices, answerChoice: choices.indexOf(answer) };
}

/** 似た文字を優先して、まちがいを3つ選ぶ */
function letterDistractors(rng: Rng, target: string, groups: readonly string[], pool: string): string[] {
  const out: string[] = [];
  const group = groups.find((g) => g.includes(target)) ?? "";
  for (const c of shuffle(rng, [...group])) if (c !== target && out.length < 3) out.push(c);
  for (const c of shuffle(rng, [...pool])) if (c !== target && !out.includes(c) && out.length < 3) out.push(c);
  return out;
}

function alphaCase(level: string, rng: Rng): Question {
  const upper = pick(rng, [...UPPER]);
  const lower = upper.toLowerCase();
  if (chance(rng, 0.5)) {
    const wrong = letterDistractors(rng, lower, LOWER_CONFUSABLE, UPPER.toLowerCase());
    return {
      level,
      prompt: "おなじ もじの こもじは どれ？",
      tokens: [],
      kind: "choice",
      bigText: upper,
      choiceStyle: "en",
      ...withChoices(rng, lower, wrong),
      meta: { type: "case", letter: upper },
    };
  }
  const wrongLower = letterDistractors(rng, lower, LOWER_CONFUSABLE, UPPER.toLowerCase());
  return {
    level,
    prompt: "おなじ もじの おおもじは どれ？",
    tokens: [],
    kind: "choice",
    bigText: lower,
    choiceStyle: "en",
    ...withChoices(rng, upper, wrongLower.map((c) => c.toUpperCase())),
    meta: { type: "case", letter: upper },
  };
}

function alphaListen(level: string, rng: Rng): Question {
  const upper = pick(rng, [...UPPER]);
  const wrong = letterDistractors(rng, upper, SOUND_CONFUSABLE, UPPER);
  return {
    level,
    prompt: "きこえた もじは どれ？",
    tokens: [],
    kind: "choice",
    speak: upper,
    speakLang: "en-US",
    choiceStyle: "en",
    ...withChoices(rng, upper, wrong),
    meta: { type: "listen", letter: upper },
  };
}

const meaning = (w: EnglishWord) => `${w.emoji} ${w.ja}`;

export function wordQuestion(level: string, rng: Rng, words: readonly EnglishWord[], canSpeak: boolean): Question {
  const w = pick(rng, words);
  const others = shuffle(
    rng,
    words.filter((x) => x.en !== w.en),
  ).slice(0, 3);
  const r = rng.next();
  if (canSpeak && r < 0.34) {
    return {
      level,
      prompt: "きこえた ことばの いみは どれ？",
      tokens: [],
      kind: "choice",
      speak: w.en,
      speakLang: "en-US",
      choiceStyle: "meaning",
      ...withChoices(rng, meaning(w), others.map(meaning)),
      meta: { type: "listen", en: w.en },
    };
  }
  if (r < (canSpeak ? 0.67 : 0.5)) {
    return {
      level,
      prompt: "いみは どれ？",
      tokens: [],
      kind: "choice",
      bigText: w.en,
      bigTextSize: "large",
      // 発音を聞けるように（答えの手がかりにはならない）
      speak: canSpeak ? w.en : undefined,
      speakLang: "en-US",
      choiceStyle: "meaning",
      ...withChoices(rng, meaning(w), others.map(meaning)),
      meta: { type: "en2ja", en: w.en },
    };
  }
  return {
    level,
    prompt: "えいごで どれ？",
    tokens: [],
    kind: "choice",
    bigText: meaning(w),
    bigTextSize: "large",
    choiceStyle: "en",
    ...withChoices(rng, w.en, others.map((o) => o.en)),
    meta: { type: "ja2en", en: w.en },
  };
}

export function phraseQuestion(level: string, rng: Rng, phrases: readonly { en: string; ja: string }[], canSpeak: boolean): Question {
  const p = pick(rng, phrases);
  const others = shuffle(
    rng,
    phrases.filter((x) => x.en !== p.en),
  ).slice(0, 3);
  const r = rng.next();
  // 並べかえ（いちばん多く出す）
  if (r < 0.4) {
    const tokens = phraseTokens(p.en);
    let tiles = shuffle(rng, tokens);
    for (let i = 0; i < 5 && tiles.join(" ") === p.en && tokens.length > 1; i++) tiles = shuffle(rng, tokens);
    return {
      level,
      prompt: "ならべかえて えいごに しよう",
      tokens: [],
      kind: "order",
      bigText: p.ja,
      bigTextSize: "medium",
      tiles,
      answerTokens: tokens,
      meta: { type: "order", en: p.en },
    };
  }
  if (canSpeak && r < 0.6) {
    return {
      level,
      prompt: "きこえた えいごの いみは どれ？",
      tokens: [],
      kind: "choice",
      speak: p.en,
      speakLang: "en-US",
      choiceStyle: "phrase",
      ...withChoices(rng, p.ja, others.map((o) => o.ja)),
      meta: { type: "listen", en: p.en },
    };
  }
  if (r < 0.8) {
    return {
      level,
      prompt: "いみは どれ？",
      tokens: [],
      kind: "choice",
      bigText: p.en,
      bigTextSize: "medium",
      speak: canSpeak ? p.en : undefined,
      speakLang: "en-US",
      choiceStyle: "phrase",
      ...withChoices(rng, p.ja, others.map((o) => o.ja)),
      meta: { type: "en2ja", en: p.en },
    };
  }
  return {
    level,
    prompt: "えいごで どれ？",
    tokens: [],
    kind: "choice",
    bigText: p.ja,
    bigTextSize: "medium",
    choiceStyle: "phrase",
    ...withChoices(rng, p.en, others.map((o) => o.en)),
    meta: { type: "ja2en", en: p.en },
  };
}

export function generateEnglishQuestion(level: string, rng: Rng, opts: EnglishGenOptions): Question {
  const lv = getEnglishLevel(level);
  if (!lv) throw new Error(`unknown level ${level}`);
  switch (lv.kind) {
    case "alpha_case":
      return alphaCase(level, rng);
    case "alpha_listen":
      // 読み上げが使えない端末では、大文字・小文字の問題にする
      return opts.canSpeak ? alphaListen(level, rng) : alphaCase(level, rng);
    case "words":
      return wordQuestion(level, rng, lv.words ?? [], opts.canSpeak);
    case "phrases":
      return phraseQuestion(level, rng, lv.phrases ?? [], opts.canSpeak);
  }
}
