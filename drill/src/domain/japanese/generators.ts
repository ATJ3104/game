// 国語の問題生成（選択肢4つ）。正解の位置はサーバーだけが持つ
import type { Question } from "../math/question";
import { pick, chance, type Rng } from "../math/rng";
import { KANA_WORDS } from "./content";
import { ALL_HIRAGANA, NOT_FOR_LISTENING, confusablesOf, sameKindOf, soundsSame, toHiragana, toKatakana } from "./kana";
import { getJapaneseLevel, kanjiOfLevel } from "./levels";
import { parseSentence } from "./richText";

export interface JapaneseGenOptions {
  /** 端末で日本語の読み上げが使えるか */
  canSpeak: boolean;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 正解＋まちがい3つを並べ替えて、正解の位置を返す */
function withChoices(rng: Rng, answer: string, wrong: readonly string[]): { choices: string[]; answerChoice: number } {
  const choices = shuffle(rng, [answer, ...wrong.slice(0, 3)]);
  return { choices, answerChoice: choices.indexOf(answer) };
}

/** まちがいの文字を3つ選ぶ（形の似た文字を優先。同じ音に聞こえる文字は入れない） */
function kanaDistractors(rng: Rng, target: string, pool: (k: string) => string[]): string[] {
  const out: string[] = [];
  const add = (cands: string[]) => {
    for (const c of shuffle(rng, cands)) {
      if (out.length >= 3) return;
      if (c !== target && !out.includes(c) && !soundsSame(c, target) && !out.some((o) => soundsSame(o, c))) out.push(c);
    }
  };
  add(pool(target));
  add(sameKindOf(target));
  return out;
}

function kanaListen(level: string, rng: Rng, katakana: boolean): Question {
  const pool = ALL_HIRAGANA.filter((k) => !NOT_FOR_LISTENING.has(k));
  const hira = pick(rng, pool);
  const target = katakana ? toKatakana(hira) : hira;
  const wrong = kanaDistractors(rng, target, confusablesOf);
  return {
    level,
    prompt: "きこえた もじは どれ？",
    tokens: [],
    kind: "choice",
    speak: hira,
    choiceStyle: "kana",
    ...withChoices(rng, target, wrong),
    meta: { type: "listen", kana: target },
  };
}

function hiraganaPicture(level: string, rng: Rng): Question {
  const w = pick(rng, KANA_WORDS.words);
  const others = shuffle(
    rng,
    KANA_WORDS.words.filter((x) => x.kana !== w.kana),
  ).slice(0, 3);
  return {
    level,
    prompt: "この もじで はじまる ものは どれ？",
    tokens: [],
    kind: "choice",
    bigText: w.kana,
    choiceStyle: "emoji",
    ...withChoices(rng, w.emoji, others.map((o) => o.emoji)),
    meta: { type: "picture", kana: w.kana, word: w.word },
  };
}

function katakanaReading(level: string, rng: Rng): Question {
  const hira = pick(rng, ALL_HIRAGANA);
  const kata = toKatakana(hira);
  // カタカナの形が似た文字の「ひらがな」を、まちがいにする
  const wrong = kanaDistractors(rng, hira, (h) => [
    ...confusablesOf(toKatakana(h)).map(toHiragana),
    ...confusablesOf(h),
  ]);
  return {
    level,
    prompt: "よみかたは どれ？",
    tokens: [],
    kind: "choice",
    bigText: kata,
    choiceStyle: "kana",
    ...withChoices(rng, hira, wrong),
    meta: { type: "read", kana: kata },
  };
}

function kanjiQuestion(level: string, rng: Rng): Question {
  const lv = getJapaneseLevel(level)!;
  const entries = kanjiOfLevel(lv);
  if (entries.length === 0) throw new Error(`no content for ${level}`);
  const entry = pick(rng, entries);
  const ex = pick(rng, entry.examples);
  const { segments } = parseSentence(ex.sentence, ex.reading);
  if (chance(rng, 0.5)) {
    return {
      level,
      prompt: "＿の よみかたは どれ？",
      tokens: [],
      kind: "choice",
      rich: segments,
      targetMode: "show_kanji",
      choiceStyle: "reading",
      ...withChoices(rng, ex.reading, ex.readWrong),
      meta: { type: "read", kanji: entry.kanji, word: ex.word },
    };
  }
  return {
    level,
    prompt: "＿に あう かんじは どれ？",
    tokens: [],
    kind: "choice",
    rich: segments,
    targetMode: "show_reading",
    choiceStyle: "kanji",
    ...withChoices(rng, ex.word, ex.kanjiWrong),
    meta: { type: "write", kanji: entry.kanji, word: ex.word },
  };
}

export function generateJapaneseQuestion(level: string, rng: Rng, opts: JapaneseGenOptions): Question {
  const lv = getJapaneseLevel(level);
  if (!lv) throw new Error(`unknown level ${level}`);
  if (lv.kind === "hiragana") {
    return opts.canSpeak && chance(rng, 0.5) ? kanaListen(level, rng, false) : hiraganaPicture(level, rng);
  }
  if (lv.kind === "katakana") {
    return opts.canSpeak && chance(rng, 0.5) ? kanaListen(level, rng, true) : katakanaReading(level, rng);
  }
  return kanjiQuestion(level, rng);
}
