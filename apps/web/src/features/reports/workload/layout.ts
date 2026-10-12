import { HEAVY_FACTOR, type WorkloadPerson } from '@kite/shared';
import type { WorkloadSort } from '../params';

/** The design's scale: 25 points for capacity 15. */
const MIN_SCALE = 25;

const ceilTo = (v: number, step: number) => Math.ceil(v / step) * step;

/**
 * One scale shared by every row so bars compare: at least 25 points, else whatever covers the
 * largest open size or Heavy threshold (capacity × 1.2), rounded up to 5.
 */
export function workloadScale(people: readonly Pick<WorkloadPerson, 'points' | 'capacity'>[]) {
  const largest = Math.max(0, ...people.map((p) => Math.max(p.points, p.capacity * HEAVY_FACTOR)));
  return Math.max(MIN_SCALE, ceilTo(largest, 5));
}

/** Tick values from 0 to `scale`: every 5 points up to 40, else every 10. */
export function workloadTicks(scale: number): number[] {
  const step = scale <= 40 ? 5 : 10;
  const ticks: number[] = [];
  for (let v = 0; v <= scale; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] !== scale) ticks.push(scale);
  return ticks;
}

/**
 * Open size: points, then overdue points; Overdue: overdue points, then points; ties by name.
 * Order only; no ranks are shown.
 */
export function sortPeople(people: readonly WorkloadPerson[], sort: WorkloadSort) {
  const overdue = (p: WorkloadPerson) => p.buckets.overdue.points;
  return [...people].sort(
    (a, b) =>
      (sort === 'overdue'
        ? overdue(b) - overdue(a) || b.points - a.points
        : b.points - a.points || overdue(b) - overdue(a)) || a.user.name.localeCompare(b.user.name),
  );
}

/** One capacity for everyone (the team line and footnote then name it), else null. */
export function sharedCapacity(people: readonly Pick<WorkloadPerson, 'capacity'>[]) {
  const first = people[0]?.capacity;
  return first !== undefined && people.every((p) => p.capacity === first) ? first : null;
}
