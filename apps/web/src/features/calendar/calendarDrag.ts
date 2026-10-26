import { addDays, weekdayIndex } from '@kite/shared';
import type { CollisionDetection } from '@dnd-kit/core';
import type { CalendarMode } from '../../stores/ui';

/** Droppable ids: one per visible day, plus the Unscheduled panel. */
export const DAY_PREFIX = 'day:';
export const UNSCHEDULED_ID = 'unscheduled';

/** A drop target: a `YYYY-MM-DD` day or the Unscheduled panel. */
export type CalendarTarget = { kind: 'day'; date: string } | { kind: 'unscheduled' };

export const dayId = (date: string) => `${DAY_PREFIX}${date}`;

export function targetOf(id: string | number | undefined | null): CalendarTarget | null {
  if (id === undefined || id === null) return null;
  const value = String(id);
  if (value === UNSCHEDULED_ID) return { kind: 'unscheduled' };
  return value.startsWith(DAY_PREFIX)
    ? { kind: 'day', date: value.slice(DAY_PREFIX.length) }
    : null;
}

/** The due date a drop would set (`null` = clear), or `undefined` when it changes nothing. */
export function dropDue(
  current: string | null,
  target: CalendarTarget | null,
  closed: boolean,
): string | null | undefined {
  if (!target) return undefined;
  if (target.kind === 'day') return target.date === current ? undefined : target.date;
  // Closed tasks never go to Unscheduled (they keep their date on the calendar).
  return current === null || closed ? undefined : null;
}

/**
 * Keyboard drag: ←/→ one day, ↑/↓ one week (month view). → from a Sunday reaches Unscheduled;
 * ← from Unscheduled returns to `fallback`. Days outside `days` are not reachable.
 */
export function keyTarget(
  current: CalendarTarget,
  key: string,
  days: readonly string[],
  mode: CalendarMode,
  fallback: string,
): CalendarTarget | null {
  if (current.kind === 'unscheduled') {
    return key === 'ArrowLeft' ? { kind: 'day', date: fallback } : null;
  }
  const step: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ...(mode === 'month' ? { ArrowUp: -7, ArrowDown: 7 } : {}),
  };
  const delta = step[key];
  if (delta === undefined) return null;
  if (key === 'ArrowRight' && weekdayIndex(current.date) === 6) return { kind: 'unscheduled' };
  const date = addDays(current.date, delta);
  return days.includes(date) ? { kind: 'day', date } : null;
}

/**
 * The droppable under the pointer (keyboard: under the lifted item's center). Days tile the grid,
 * so a containment test is all that's needed.
 */
export const pointInside: CollisionDetection = ({
  collisionRect,
  droppableContainers,
  droppableRects,
  pointerCoordinates,
}) => {
  const point = pointerCoordinates ?? {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  for (const container of droppableContainers) {
    const r = droppableRects.get(container.id);
    if (r && point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom) {
      return [{ id: container.id }];
    }
  }
  return [];
};
