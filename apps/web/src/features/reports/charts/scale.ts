/**
 * Y axis for a count chart: 5 ticks (0 and 4 equal steps) whose top covers `max`. Steps are
 * whole numbers from 1·2·5 × 10ⁿ, so 38 → 0 10 20 30 40 and 3 → 0 1 2 3 4.
 */
export function niceTicks(max: number, intervals = 4): number[] {
  const raw = Math.max(max, 0) / intervals;
  const magnitude = raw >= 1 ? 10 ** Math.floor(Math.log10(raw)) : 1;
  const step = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? 10 * magnitude;
  return Array.from({ length: intervals + 1 }, (_, i) => i * step);
}

/** Center of the i-th of n equal columns, as a 0–1 fraction (the design's `(i + 0.5) / n`). */
export const columnCenter = (i: number, n: number): number => (i + 0.5) / n;

/** SVG path through points given as 0–1 x fractions and pixel y, on a 1000-wide viewBox. */
export function linePath(points: readonly { x: number; y: number }[]): string {
  return points
    .map((p, i) => `${i ? 'L' : 'M'}${(p.x * 1000).toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}

/** Horizontal position (in %) and shift of a tooltip over column `index` of `count`. */
export function tooltipPlacement(index: number, count: number) {
  const left = ((index + 0.5) / count) * 100;
  const shift = index < 2 ? '-12px' : index > count - 3 ? 'calc(-100% + 12px)' : '-50%';
  return { left: `${left.toFixed(2)}%`, transform: `translateX(${shift})` };
}
