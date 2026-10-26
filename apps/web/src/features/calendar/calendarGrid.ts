import {
  addDays,
  isClosedCategory,
  startOfWeek,
  weekdayIndex,
  type TaskListItem,
} from '@kite/shared';
import type { CalendarMode } from '../../stores/ui';

/** A month cell shows every task up to this many; more → `MONTH_MAX - 1` pills + "+N more". */
export const MONTH_MAX = 3;

export interface CalendarDay {
  /** `YYYY-MM-DD`. */
  date: string;
  /** Part of the shown month (always true in week mode). */
  inPeriod: boolean;
  weekend: boolean;
}

const monthOf = (date: string) => date.slice(0, 7);
const firstOfMonth = (date: string) => `${monthOf(date)}-01`;

/** The days on screen for `anchor`: Monday-first whole weeks of its month, or its Mon–Sun week. */
export function calendarDays(anchor: string, mode: CalendarMode): CalendarDay[] {
  const day = (date: string, inPeriod: boolean): CalendarDay => ({
    date,
    inPeriod,
    weekend: weekdayIndex(date) >= 5,
  });
  if (mode === 'week') {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => day(addDays(start, i), true));
  }
  const month = monthOf(anchor);
  const start = startOfWeek(firstOfMonth(anchor));
  const days: CalendarDay[] = [];
  // Whole weeks until the month is covered (4–6 rows).
  for (let date = start; days.length % 7 !== 0 || monthOf(date) <= month; date = addDays(date, 1)) {
    days.push(day(date, monthOf(date) === month));
  }
  return days;
}

/** The anchor one period earlier/later (month: the 1st of that month). */
export function shiftPeriod(anchor: string, mode: CalendarMode, step: -1 | 1): string {
  if (mode === 'week') return addDays(startOfWeek(anchor), step * 7);
  const [y = 1970, m = 1] = anchor.split('-').map(Number);
  const index = y * 12 + (m - 1) + step;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}-01`;
}

const parts = (date: string) => {
  const [year = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return { year, m, d };
};

/** Which `calendar.period.*` template titles the period, with every variable both languages use. */
export function periodTitle(
  anchor: string,
  mode: CalendarMode,
): {
  key: 'month' | 'week' | 'weekCrossMonth' | 'weekCrossYear';
  vars: Record<string, number>;
} {
  if (mode === 'month') {
    const { year, m } = parts(anchor);
    return { key: 'month', vars: { year, m } };
  }
  const startDate = startOfWeek(anchor);
  const start = parts(startDate);
  const end = parts(addDays(startDate, 6));
  const vars = {
    year: end.year,
    m: start.m,
    startM: start.m,
    endM: end.m,
    startDay: start.d,
    endDay: end.d,
    startYear: start.year,
    endYear: end.year,
  };
  if (start.year !== end.year) return { key: 'weekCrossYear', vars };
  if (start.m !== end.m) return { key: 'weekCrossMonth', vars };
  return { key: 'week', vars };
}

/** Done or cancelled: struck through, never Unscheduled. */
export const isClosed = (task: Pick<TaskListItem, 'status'>) =>
  isClosedCategory(task.status.category);

/**
 * Places tasks by their current due date: on a visible day, or (no due date, not closed) in
 * Unscheduled. Rows may come from both calendar queries, and an optimistic due change edits a row
 * in place, so placing by the row's own `dueDate` moves it between grid and panel at once.
 */
export function placeTasks(
  rows: readonly TaskListItem[],
  days: readonly CalendarDay[],
): { byDay: Map<string, TaskListItem[]>; unscheduled: TaskListItem[] } {
  const byDay = new Map<string, TaskListItem[]>(days.map((d) => [d.date, []]));
  const unscheduled: TaskListItem[] = [];
  const seen = new Set<string>();
  for (const task of rows) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    if (task.dueDate) byDay.get(task.dueDate)?.push(task);
    else if (!isClosed(task)) unscheduled.push(task);
  }
  return { byDay, unscheduled };
}

/** Month cell: up to `MONTH_MAX` pills; more → `MONTH_MAX - 1` + "+N more". */
export function visiblePills<T>(tasks: readonly T[]): { shown: readonly T[]; more: number } {
  if (tasks.length <= MONTH_MAX) return { shown: tasks, more: 0 };
  const shown = tasks.slice(0, MONTH_MAX - 1);
  return { shown, more: tasks.length - shown.length };
}
