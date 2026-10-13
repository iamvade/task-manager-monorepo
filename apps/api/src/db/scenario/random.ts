import { mulberry32 } from '../seed/history.js';

/** Seeded randomness helpers: the same scenario always builds the same data (relative to today). */
export interface Rng {
  /** Uniform in [0, 1). */
  next: () => number;
  chance: (p: number) => boolean;
  /** Integer in [min, max]. */
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  /** `n` distinct items (fewer if the list is shorter). */
  sample: <T>(items: readonly T[], n: number) => T[];
  /** One item, chosen with probability proportional to `weight(item)`; null when all are 0. */
  weighted: <T>(items: readonly T[], weight: (item: T) => number) => T | null;
  /** Log-normal around `median`. */
  lognormal: (median: number, sigma?: number) => number;
  shuffle: <T>(items: readonly T[]) => T[];
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(next() * items.length)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  };
  const shuffle = <T>(items: readonly T[]): T[] => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  };
  return {
    next,
    chance: (p) => next() < p,
    int,
    pick,
    sample: (items, n) => shuffle(items).slice(0, n),
    weighted: (items, weight) => {
      let total = 0;
      for (const item of items) total += Math.max(0, weight(item));
      if (total <= 0) return null;
      let r = next() * total;
      for (const item of items) {
        r -= Math.max(0, weight(item));
        if (r < 0) return item;
      }
      return items[items.length - 1] ?? null;
    },
    lognormal: (median, sigma = 0.8) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return median * Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
    },
    shuffle,
  };
}
