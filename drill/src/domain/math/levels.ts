// 算数レベル表（SPEC 7.2）。targetMs は「目標の平均解答時間」

export interface MathLevel {
  code: string;
  name: string;
  /** 目標の平均解答時間（ミリ秒） */
  targetMs: number;
}

export const MATH_LEVELS: readonly MathLevel[] = [
  { code: "M01", name: "10までのたし算", targetMs: 4000 },
  { code: "M02", name: "10までのひき算", targetMs: 4000 },
  { code: "M03", name: "くり上がりのあるたし算（20まで）", targetMs: 5000 },
  { code: "M04", name: "くり下がりのあるひき算（20まで）", targetMs: 5000 },
  { code: "M05", name: "2けた±1けた", targetMs: 6000 },
  { code: "M06", name: "2けた±2けた（くり上がり・くり下がりなし）", targetMs: 8000 },
  { code: "M07", name: "2けた±2けた（くり上がり・くり下がりあり）", targetMs: 12000 },
  { code: "M08", name: "3けたのたし算・ひき算", targetMs: 15000 },
  { code: "M09", name: "かけ算九九（2・5・3・4の段）", targetMs: 3000 },
  { code: "M10", name: "かけ算九九（6・7・8・9・1の段）", targetMs: 3000 },
  { code: "M11", name: "九九ランダム", targetMs: 3000 },
  { code: "M12", name: "わり算（九九の逆、あまりなし）", targetMs: 4000 },
  { code: "M13", name: "あまりのあるわり算", targetMs: 7000 },
  { code: "M14", name: "2けた×1けた", targetMs: 10000 },
  { code: "M15", name: "3けた×1けた", targetMs: 15000 },
  { code: "M16", name: "2けた×2けた", targetMs: 30000 },
  { code: "M17", name: "2けた÷1けた", targetMs: 15000 },
  { code: "M18", name: "3けた÷1けた", targetMs: 25000 },
  { code: "M19", name: "÷2けた", targetMs: 30000 },
  { code: "M20", name: "小数のたし算・ひき算", targetMs: 15000 },
  { code: "M21", name: "小数×整数、小数÷整数", targetMs: 20000 },
  { code: "M22", name: "分数のたし算・ひき算（同じ分母）", targetMs: 12000 },
  { code: "M23", name: "約分・通分", targetMs: 15000 },
  { code: "M24", name: "分数のたし算・ひき算（ちがう分母）", targetMs: 30000 },
  { code: "M25", name: "小数×小数", targetMs: 20000 },
  { code: "M26", name: "小数÷小数", targetMs: 25000 },
  { code: "M27", name: "分数×分数", targetMs: 20000 },
  { code: "M28", name: "分数÷分数", targetMs: 25000 },
  { code: "M29", name: "計算の順序（四則混合・かっこ）", targetMs: 30000 },
];

export function getMathLevel(code: string): MathLevel | undefined {
  return MATH_LEVELS.find((l) => l.code === code);
}

export function mathLevelIndex(code: string): number {
  return MATH_LEVELS.findIndex((l) => l.code === code);
}

export function prevMathLevel(code: string): string | null {
  const i = mathLevelIndex(code);
  return i > 0 ? MATH_LEVELS[i - 1]!.code : null;
}

export function nextMathLevel(code: string): string | null {
  const i = mathLevelIndex(code);
  return i >= 0 && i < MATH_LEVELS.length - 1 ? MATH_LEVELS[i + 1]!.code : null;
}
