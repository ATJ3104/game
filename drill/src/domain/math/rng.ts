/** 乱数（テストでは種を固定できるようにする） */
export interface Rng {
  /** 0 以上 1 未満 */
  next(): number;
}

/** mulberry32（種つきの軽量 PRNG） */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export const mathRandomRng: Rng = { next: () => Math.random() };

/** min 以上 max 以下の整数 */
export function randInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng.next() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng.next() * items.length)]!;
}

export function chance(rng: Rng, p: number): boolean {
  return rng.next() < p;
}
