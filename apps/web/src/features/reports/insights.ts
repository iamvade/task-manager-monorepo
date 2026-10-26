import type { WaitCategory } from '@kite/shared';

export type { WaitCategory };

export interface WaitsInsight {
  category: WaitCategory;
  days: number;
  /** Slowest ÷ next slowest, rounded to the nearest 0.5. */
  ratio: number;
}

/**
 * "Tasks wait longest in review — 4.6 days on median, about twice as long as any other status."
 * The slowest category and its ratio to the next slowest; null when fewer than two categories
 * have a median (nothing to compare).
 */
export function waitsInsight(
  waits: readonly { category: WaitCategory; medianDays: number | null }[],
): WaitsInsight | null {
  const ranked = waits
    .filter((w): w is { category: WaitCategory; medianDays: number } => w.medianDays !== null)
    .sort((a, b) => b.medianDays - a.medianDays);
  const [slowest, next] = ranked;
  if (!slowest || !next || slowest.medianDays <= 0) return null;
  const ratio =
    next.medianDays > 0 ? Math.round((slowest.medianDays / next.medianDays) * 2) / 2 : Infinity;
  return { category: slowest.category, days: slowest.medianDays, ratio };
}

/** Which sentence the ratio reads as (`much` when the next slowest has a zero median). */
export function insightVariant(ratio: number): 'slight' | 'twice' | 'times' | 'much' {
  if (!Number.isFinite(ratio)) return 'much';
  if (ratio < 1.5) return 'slight';
  if (ratio === 2) return 'twice';
  return 'times';
}
