export type SeededRng = {
  readonly seed: number;
  next(): number;
  int(max: number): number;
  pick<T>(items: readonly T[]): T;
};

/** Mulberry32 — same seed yields the same stream. */
export function createRng(seed: number): SeededRng {
  let a = seed >>> 0;
  if (a === 0) a = 0x9e3779b9;
  const next = () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed,
    next,
    int(max: number) {
      if (max <= 0) return 0;
      return Math.floor(next() * max);
    },
    pick<T>(items: readonly T[]) {
      if (!items.length) throw new Error('rng.pick: empty');
      return items[Math.floor(next() * items.length)]!;
    },
  };
}

export function hashSeed(parts: Array<string | number>): number {
  let h = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

export function shuffleInPlace<T>(items: T[], rng: SeededRng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}
