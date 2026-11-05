// 教材データの検証（テストと `npm run content:check` から使う）
import { GRADE_SIZES, KANJI_FILES, type KanaWordsFile, type KanjiFile } from "./content";
import { HIRAGANA_RE, KATAKANA_RE, isKanji, kanjiIn, parseSentence } from "./richText";
import { JAPANESE_LEVELS, learnedKanjiThrough, partOfIndex } from "./levels";
import { SEION } from "./kana";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

const KUN_RE = /^[ぁ-ゖー]+(\.[ぁ-ゖー]+)?$/;

function allKanjiUpToGrade(grade: number): Set<string> {
  const set = new Set<string>();
  for (let g = 1; g <= grade; g++) for (const k of KANJI_FILES[g]?.kanji ?? []) set.add(k.kanji);
  return set;
}

export function validateKanjiFile(file: KanjiFile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = file.grade;
  if (file.kanji.length !== GRADE_SIZES[g]) {
    errors.push(`${g}年: 字数が ${file.kanji.length}（配当表は ${GRADE_SIZES[g]}字）`);
  }
  const seen = new Set<string>();
  // 他の学年との重複
  for (const [og, of] of Object.entries(KANJI_FILES)) {
    if (Number(og) === g || !of) continue;
    for (const k of of.kanji) seen.add(k.kanji);
  }
  const dupInOthers = new Set(seen);
  seen.clear();
  const upToGrade = allKanjiUpToGrade(g);

  file.kanji.forEach((entry, index) => {
    const at = `${g}年 ${index + 1}番目「${entry.kanji}」`;
    if ([...entry.kanji].length !== 1 || !isKanji(entry.kanji)) errors.push(`${at}: 漢字1文字ではありません`);
    if (seen.has(entry.kanji)) errors.push(`${at}: 同じ学年に重複`);
    if (dupInOthers.has(entry.kanji)) errors.push(`${at}: ほかの学年と重複`);
    seen.add(entry.kanji);
    for (const on of entry.on) if (!KATAKANA_RE.test(on)) errors.push(`${at}: 音読み「${on}」はカタカナで`);
    for (const kun of entry.kun) if (!KUN_RE.test(kun)) errors.push(`${at}: 訓読み「${kun}」の形式（ひらがな、送りがなは「.」で区切る）`);
    if (entry.on.length + entry.kun.length === 0) errors.push(`${at}: 読みがありません`);
    if (entry.examples.length === 0) errors.push(`${at}: 例がありません`);

    const level = JAPANESE_LEVELS.find((l) => l.kind === "kanji" && l.grade === g && l.part === partOfIndex(g, index))!;
    const learned = learnedKanjiThrough(level);

    entry.examples.forEach((ex, j) => {
      const ea = `${at} 例${j + 1}「${ex.word}」`;
      if (!ex.word.includes(entry.kanji)) errors.push(`${ea}: 熟語にこの漢字が入っていません`);
      if (!HIRAGANA_RE.test(ex.reading)) errors.push(`${ea}: 読み「${ex.reading}」はひらがなで`);
      for (const ch of kanjiIn(ex.word)) {
        if (!learned.has(ch)) errors.push(`${ea}: 「${ch}」はこのレベル（${level.code}）までに習わない漢字`);
      }
      // 例文
      const parsed = parseSentence(ex.sentence, ex.reading);
      if (parsed.targetCount !== 1) errors.push(`${ea}: 例文の [[ ]] はちょうど1つ（${parsed.targetCount}つ）`);
      for (const seg of parsed.segments) {
        if (seg.t === "target" && seg.v !== ex.word) errors.push(`${ea}: [[${seg.v}]] が熟語と違います`);
        if (seg.t === "text" && kanjiIn(seg.v).length) {
          errors.push(`${ea}: 例文の「${kanjiIn(seg.v).join("")}」にふりがながありません（{漢字|よみ} で書く）`);
        }
        if (seg.t === "ruby") {
          if (!HIRAGANA_RE.test(seg.rt)) errors.push(`${ea}: ふりがな「${seg.rt}」はひらがなで`);
          for (const ch of kanjiIn(seg.base)) {
            if (!learned.has(ch)) errors.push(`${ea}: 例文の「${ch}」はこのレベルまでに習わない漢字（かなで書く）`);
          }
        }
      }
      // 読みの選択肢
      checkChoices(ea, "readWrong", ex.reading, ex.readWrong, errors);
      for (const w of ex.readWrong) if (!HIRAGANA_RE.test(w)) errors.push(`${ea}: 読みの選択肢「${w}」はひらがなで`);
      // 漢字の選択肢
      checkChoices(ea, "kanjiWrong", ex.word, ex.kanjiWrong, errors);
      for (const w of ex.kanjiWrong) {
        const ks = kanjiIn(w);
        if (ks.length === 0) errors.push(`${ea}: 漢字の選択肢「${w}」に漢字がありません`);
        for (const ch of ks) {
          if (!upToGrade.has(ch)) errors.push(`${ea}: 漢字の選択肢「${w}」の「${ch}」は${g}年までの漢字ではありません`);
        }
        if (w.replace(/[一-鿿]/g, "") !== ex.word.replace(/[一-鿿]/g, "")) {
          warnings.push(`${ea}: 漢字の選択肢「${w}」の送りがなが正解と違います`);
        }
      }
    });
  });
  return { errors, warnings };
}

function checkChoices(at: string, name: string, answer: string, wrong: string[], errors: string[]): void {
  if (wrong.length !== 3) errors.push(`${at}: ${name} は3つ（${wrong.length}つ）`);
  if (wrong.includes(answer)) errors.push(`${at}: ${name} に正解「${answer}」が入っています`);
  if (new Set(wrong).size !== wrong.length) errors.push(`${at}: ${name} に重複があります`);
}

export function validateKanaWords(file: KanaWordsFile): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const w of file.words) {
    if (!SEION.includes(w.kana) || [...w.kana].length !== 1) errors.push(`かなの絵「${w.word}」: 清音1文字ではありません`);
    if (!w.word.startsWith(w.kana)) errors.push(`かなの絵「${w.word}」: 「${w.kana}」で始まりません`);
    if (!HIRAGANA_RE.test(w.word)) errors.push(`かなの絵「${w.word}」: ひらがなで書いてください`);
    if (!w.emoji) errors.push(`かなの絵「${w.word}」: 絵文字がありません`);
    if (seen.has(w.kana)) errors.push(`かなの絵「${w.word}」: 「${w.kana}」が重複`);
    seen.add(w.kana);
  }
  const emojis = file.words.map((w) => w.emoji);
  if (new Set(emojis).size !== emojis.length) errors.push("かなの絵: 同じ絵文字が2回使われています");
  if (file.words.length < 4) errors.push("かなの絵: 4つ以上必要です");
  return { errors, warnings };
}
