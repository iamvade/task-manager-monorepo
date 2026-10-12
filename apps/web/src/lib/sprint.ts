import { addDays, addWorkingDays, workingDaysBetween } from '@kite/shared';
import type { TFunction } from 'i18next';

/** A sprint's display name: its own, else "Sprint 14" / "14-р спринт". */
export function sprintLabel(
  t: TFunction,
  sprint: { name: string | null; number?: number | undefined },
): string {
  if (sprint.name) return sprint.name;
  return sprint.number === undefined ? '' : t('sprint.name', { number: sprint.number });
}

/** Working days in a new project's first sprint (two weeks). */
const DEFAULT_SPRINT_DAYS = 10;

/**
 * Prefilled dates for a new sprint: the first working day after the latest sprint ends (not
 * before today), as many working days long as that sprint (else two weeks). Weekends only:
 * the client doesn't know the workspace's holidays.
 */
export function nextSprintDates(
  sprints: readonly { startDate: string; endDate: string }[],
  today: string,
): { startDate: string; endDate: string } {
  const last = sprints.reduce<(typeof sprints)[number] | undefined>(
    (latest, s) => (!latest || s.endDate > latest.endDate ? s : latest),
    undefined,
  );
  const after = last && last.endDate >= today ? addDays(last.endDate, 1) : today;
  const startDate = addWorkingDays(after, 0);
  const days = last ? workingDaysBetween(last.startDate, last.endDate) : 0;
  const endDate = addWorkingDays(startDate, (days > 0 ? days : DEFAULT_SPRINT_DAYS) - 1);
  return { startDate, endDate };
}
