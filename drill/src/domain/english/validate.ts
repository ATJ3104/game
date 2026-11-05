// 英語の教材データの検証（テストと `npm run content:check` から使う）
import type { PhrasesFile, WordsFile } from "./content";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

/** 意味（日本語）はかなと記号だけ（漢字を使わない） */
const KANA_ONLY = /^[ぁ-ゖァ-ヺー・〜 　、。？！!?（）()]+$/;
const EN_WORD = /^[A-Za-z][A-Za-z'.-]*( [A-Za-z][A-Za-z'.-]*)*$/;
const EN_PHRASE = /^[A-Z][A-Za-z0-9',. -]*[.?!]$/;

function code(n: number): string {
  return `E${String(n).padStart(2, "0")}`;
}

export function phraseTokens(en: string): string[] {
  return en.split(" ").filter(Boolean);
}

export function validateWords(file: WordsFile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allEn = new Map<string, string>();
  let prev = 9;
  for (const lv of file.levels) {
    const at = `単語 ${lv.code}「${lv.theme}」`;
    const n = Number(lv.code.slice(1));
    if (!/^E\d{2}$/.test(lv.code) || n < 10 || n > 49) errors.push(`${at}: コードは E10〜E49`);
    if (n !== prev + 1) errors.push(`${at}: コードは ${code(prev + 1)} から順に（とばさない）`);
    prev = n;
    if (!lv.theme) errors.push(`${at}: テーマがありません`);
    if (lv.words.length < 8 || lv.words.length > 25) errors.push(`${at}: 単語は8〜25こ（${lv.words.length}こ）`);
    const ja = new Set<string>();
    const emoji = new Set<string>();
    for (const w of lv.words) {
      const wa = `${at} 「${w.en}」`;
      if (!EN_WORD.test(w.en)) errors.push(`${wa}: 英語の形式（英字・空白・' - . だけ）`);
      const key = w.en.toLowerCase();
      if (allEn.has(key)) errors.push(`${wa}: ${allEn.get(key)} と重複`);
      allEn.set(key, lv.code);
      if (!KANA_ONLY.test(w.ja)) errors.push(`${wa}: 意味「${w.ja}」はかなだけで`);
      if (ja.has(w.ja)) errors.push(`${wa}: 同じレベルに同じ意味「${w.ja}」があります（選択肢で区別できない）`);
      ja.add(w.ja);
      if (!w.emoji) errors.push(`${wa}: 絵文字がありません`);
      else if (emoji.has(w.emoji)) warnings.push(`${wa}: 同じレベルに同じ絵文字 ${w.emoji}`);
      emoji.add(w.emoji);
    }
  }
  return { errors, warnings };
}

export function validatePhrases(file: PhrasesFile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const allEn = new Set<string>();
  let prev = 49;
  for (const lv of file.levels) {
    const at = `フレーズ ${lv.code}「${lv.theme}」`;
    const n = Number(lv.code.slice(1));
    if (!/^E\d{2}$/.test(lv.code) || n < 50 || n > 69) errors.push(`${at}: コードは E50〜E69`);
    if (n !== prev + 1) errors.push(`${at}: コードは ${code(prev + 1)} から順に（とばさない）`);
    prev = n;
    if (lv.phrases.length < 6 || lv.phrases.length > 20) errors.push(`${at}: フレーズは6〜20こ（${lv.phrases.length}こ）`);
    const ja = new Set<string>();
    for (const p of lv.phrases) {
      const pa = `${at} 「${p.en}」`;
      if (!EN_PHRASE.test(p.en)) errors.push(`${pa}: 大文字で始まり . ? ! で終わる英文で`);
      const toks = phraseTokens(p.en);
      if (toks.length < 2 || toks.length > 8) errors.push(`${pa}: 単語は2〜8こ（並べかえ問題に使うため）`);
      if (allEn.has(p.en)) errors.push(`${pa}: 重複`);
      allEn.add(p.en);
      if (!KANA_ONLY.test(p.ja)) errors.push(`${pa}: 意味「${p.ja}」はかなと記号だけで`);
      if (ja.has(p.ja)) errors.push(`${pa}: 同じレベルに同じ意味「${p.ja}」`);
      ja.add(p.ja);
    }
  }
  return { errors, warnings };
}
