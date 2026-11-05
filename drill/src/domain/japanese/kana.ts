// ひらがな・カタカナの表と「まちがえやすい文字」

export const SEION = [
  "あいうえお", "かきくけこ", "さしすせそ", "たちつてと", "なにぬねの",
  "はひふへほ", "まみむめも", "やゆよ", "らりるれろ", "わをん",
].join("");
export const DAKUON = "がぎぐげござじずぜぞだぢづでどばびぶべぼ";
export const HANDAKUON = "ぱぴぷぺぽ";
export const YOON: string[] = [];
for (const head of "きしちにひみりぎじびぴ") for (const tail of "ゃゅょ") YOON.push(head + tail);

/** ひらがな全部（1文字または拗音2文字） */
export const ALL_HIRAGANA: string[] = [...SEION, ...DAKUON, ...HANDAKUON, ...YOON];

export function toKatakana(s: string): string {
  return s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 同じ音に聞こえる組（聞き取りの選択肢に一緒に出さない・聞き取り問題に使わない） */
const SAME_SOUND: string[][] = [["じ", "ぢ"], ["ず", "づ"], ["お", "を"], ["じゃ", "ぢゃ"]];
/** 聞き取り問題に使わない文字（読み上げで区別できない） */
export const NOT_FOR_LISTENING = new Set(["ぢ", "づ", "を"]);

export function soundsSame(a: string, b: string): boolean {
  const ha = toHiragana(a);
  const hb = toHiragana(b);
  return ha === hb || SAME_SOUND.some((g) => g.includes(ha) && g.includes(hb));
}

/**
 * 形が似ていてまちがえやすい文字（ひらがな・カタカナ）。
 * 選択肢を作るときに優先して混ぜる。足りない分は同じ行・同じ種類から選ぶ
 */
const CONFUSABLE_GROUPS: string[] = [
  // ひらがな
  "あおめぬ", "いりこ", "うらつ", "きさちら", "けはほ", "しつ", "ねれわ", "るろ", "ぬめ", "まはほよ",
  "たなな", "てとそ", "くへ", "はばぱ", "ひびぴ", "ふぶぷ", "へべぺ", "ほぼぽ", "かが", "さざ", "しじ",
  "きゃきゅきょ", "しゃしゅしょ", "ちゃちゅちょ",
  // カタカナ
  "シツ", "ソンリ", "ノメヌ", "ウワク", "コユロ", "チテ", "クタケ", "エユ", "スヌ", "ナメ", "マア",
  "セヤ", "ヲラ", "カヤ", "キモ", "ハル", "ヘヘ", "フワ", "ホネ",
];

function splitKana(group: string): string[] {
  const out: string[] = [];
  for (const ch of group) {
    if ("ゃゅょャュョ".includes(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return [...new Set(out)];
}

export function confusablesOf(kana: string): string[] {
  const set = new Set<string>();
  for (const g of CONFUSABLE_GROUPS) {
    const items = splitKana(g);
    if (items.includes(kana)) for (const x of items) if (x !== kana) set.add(x);
  }
  return [...set];
}

/** 同じ種類（清音／濁音／半濁音／拗音）の文字 */
export function sameKindOf(kana: string): string[] {
  const h = toHiragana(kana);
  const pools = [[...SEION], [...DAKUON], [...HANDAKUON], YOON];
  const pool = pools.find((p) => p.includes(h)) ?? [...SEION];
  const isKata = h !== kana;
  return pool.filter((x) => x !== h).map((x) => (isKata ? toKatakana(x) : x));
}
