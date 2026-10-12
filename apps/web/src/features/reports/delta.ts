export type DeltaDirection = 'up' | 'down' | 'flat';
export type DeltaTone = 'good' | 'bad' | 'neutral';

/** A change vs the previous period: its size (always ≥ 0), which way it went, and if that's good. */
export interface Delta {
  amount: number;
  direction: DeltaDirection;
  tone: DeltaTone;
}

interface DeltaOptions {
  /**
   * `percent`: relative change in % (no delta without a previous value);
   * `diff`: absolute difference, rounded to `decimals`.
   */
  kind: 'percent' | 'diff';
  decimals?: number;
  /** A fall is the improvement (cycle time). */
  lowerIsBetter?: boolean;
  /** People / My performance: arrows only, never good/bad (design-notes 1.14). */
  neutral?: boolean;
}

/**
 * Current vs previous → `{amount, direction, tone}`; null when there is nothing to compare
 * (a missing median, or no previous value for a percentage).
 */
export function compareDelta(
  current: number | null,
  previous: number | null,
  { kind, decimals = 0, lowerIsBetter = false, neutral = false }: DeltaOptions,
): Delta | null {
  if (current === null || previous === null) return null;
  if (kind === 'percent' && previous === 0) return null;
  const factor = 10 ** decimals;
  const raw = kind === 'percent' ? ((current - previous) / previous) * 100 : current - previous;
  const amount = Math.round(Math.abs(raw) * factor) / factor;
  const direction: DeltaDirection = amount === 0 ? 'flat' : raw > 0 ? 'up' : 'down';
  const improved = lowerIsBetter ? direction === 'down' : direction === 'up';
  const tone: DeltaTone = neutral || direction === 'flat' ? 'neutral' : improved ? 'good' : 'bad';
  return { amount, direction, tone };
}

/** Whole-number share in % (on-time delivery), null without a denominator. */
export const percentOf = (part: number, total: number): number | null =>
  total > 0 ? Math.round((part / total) * 100) : null;
