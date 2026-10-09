import { daysBetween, weekdayIndex, type Home, type MyTask } from '@kite/shared';
import { todayFor } from '../lib/dates';

export type SectionId = keyof Home['sections'];
export const SECTION_IDS: readonly SectionId[] = ['overdue', 'today', 'thisWeek', 'later'];

/** The section holding `taskId`, if any. */
export function sectionOf(home: Home, taskId: string): SectionId | undefined {
  return SECTION_IDS.find((id) => home.sections[id].some((t) => t.id === taskId));
}

/** A row the page keeps on screen after the server stopped listing it (completed here). */
export interface KeptRow {
  section: SectionId;
  index: number;
  task: MyTask;
}

/** `home` with `row` back in its section at its old place, unless the section still has it. */
export function withRow(home: Home, { section, index, task }: KeptRow): Home {
  if (sectionOf(home, task.id)) return home;
  const tasks = [...home.sections[section]];
  tasks.splice(Math.min(index, tasks.length), 0, task);
  return { ...home, sections: { ...home.sections, [section]: tasks } };
}

const bump = (days: number[], index: number, by: number) =>
  days.map((n, i) => (i === index ? Math.max(0, n + by) : n));

/**
 * My Tasks after ticking (`done`) or unticking a task, as the server will report it: the row's
 * done state and the stat cards (due today, completed this week + per-day bars + delta, overdue).
 * Rows stay where they are; the page keeps completed ones in place after refetches.
 */
export function applyCompletion(home: Home, taskId: string, done: boolean, now: Date): Home {
  const section = sectionOf(home, taskId);
  const task = section && home.sections[section].find((t) => t.id === taskId);
  if (!section || !task || task.done === done) return home;

  const { today, timezone, stats } = home;
  const next: MyTask = { ...task, done, completedAt: done ? now.toISOString() : null };
  const sections = {
    ...home.sections,
    [section]: home.sections[section].map((t) => (t.id === taskId ? next : t)),
  };
  const sign = done ? -1 : 1;

  const dueToday = { ...stats.dueToday };
  if (task.dueDate === today) {
    dueToday.open += sign;
    if (task.priority === 'urgent') dueToday.urgent += sign;
  }

  // The day the completion counts on: today when ticking, the old completion's local day when
  // unticking (outside this week it was never counted).
  const completedOn = done
    ? today
    : task.completedAt && todayFor(timezone, new Date(task.completedAt));
  const completed = { ...stats.completedThisWeek };
  if (
    completedOn &&
    completedOn >= home.weekStart &&
    daysBetween(home.weekStart, completedOn) < 7
  ) {
    const by = done ? 1 : -1;
    completed.count = Math.max(0, completed.count + by);
    completed.perDay = bump(completed.perDay, weekdayIndex(completedOn), by);
    if (completedOn <= today) completed.delta += by;
  }

  const overdueOpen = sections.overdue.filter((t) => !t.done && t.dueDate);
  const overdue = {
    count: overdueOpen.length,
    oldestDaysLate: overdueOpen.reduce<number | null>((oldest, t) => {
      const late = daysBetween(t.dueDate ?? today, today);
      return oldest === null || late > oldest ? late : oldest;
    }, null),
  };

  return { ...home, sections, stats: { dueToday, completedThisWeek: completed, overdue } };
}
