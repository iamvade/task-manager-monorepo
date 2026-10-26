import {
  STATUS_CATEGORIES,
  isClosedCategory,
  weekdayIndex,
  type SprintDetail,
  type StatusCategory,
} from '@kite/shared';

/** "24%" (0 when there is nothing to divide by). */
export function percent(part: number, whole: number): string {
  return `${String(whole ? Math.round((part / whole) * 100) : 0)}%`;
}

/**
 * Burndown x labels (ReportsSprints.dc.html): the first working day, every Monday and the last
 * day; a Monday within 2 columns of the end is dropped so labels don't collide. Index 0 is the
 * sprint start point, which shares its date with day 1 and stays unlabeled.
 */
export function burndownLabelIndexes(dates: readonly string[]): Set<number> {
  const last = dates.length - 1;
  const shown = new Set<number>();
  if (last < 1) return shown;
  shown.add(1);
  for (let i = 2; i < last - 2; i++) {
    if (weekdayIndex(dates[i] ?? '') === 0) shown.add(i);
  }
  shown.add(last);
  return shown;
}

/**
 * The projection: from today's remaining (index `todayIndex`) straight to `end` at the last
 * point; null before today. Values are unrounded (the chart rounds in its tooltip).
 */
export function projectedLine(
  count: number,
  todayIndex: number,
  todayRemaining: number,
  end: number,
): (number | null)[] {
  const steps = count - 1 - todayIndex;
  return Array.from({ length: count }, (_, i) => {
    if (i < todayIndex) return null;
    if (steps <= 0) return todayRemaining;
    return todayRemaining + ((end - todayRemaining) * (i - todayIndex)) / steps;
  });
}

/** Index of today on the burndown (current sprints), else null. */
export function todayIndexOf(sprint: SprintDetail): number | null {
  return sprint.state === 'current' ? sprint.workingDays.elapsed : null;
}

/**
 * Replan: the project's List view filtered to the sprint's unfinished tasks (open statuses);
 * any filter param keeps the List from applying its default sprint filter. Like
 * `replanSpaceHref`, a path inside the workspace (callers prefix it with `useWsPath()`).
 */
export function replanHref(
  projectId: string,
  sprintId: string,
  statuses: readonly { id: string; category: StatusCategory }[] | undefined,
): string {
  const params = new URLSearchParams({ sprint: sprintId });
  const open = statuses?.filter((s) => !isClosedCategory(s.category)).map((s) => s.id) ?? [];
  if (open.length) params.set('status', open.join(','));
  return `/p/${projectId}/list?${params.toString().replace(/%2C/g, ',')}`;
}

/**
 * Replan for a sprint spanning projects: the space List filtered to the sprint's open tasks
 * (status categories, as the space List filters).
 */
export function replanSpaceHref(spaceId: string, sprintId: string): string {
  const open = STATUS_CATEGORIES.filter((c) => !isClosedCategory(c)).join(',');
  return `/s/${spaceId}/list?sprint=${sprintId}&status=${open}`;
}

/**
 * Where Replan goes: the one project in view (narrowed, or the sprint has one), else the space
 * of its projects; across spaces, the space holding most of the carried tasks.
 */
export function replanTarget(
  sprint: Pick<SprintDetail, 'projects' | 'carried'>,
  projectId: string | undefined,
): { projectId: string } | { spaceId: string } | null {
  const only = projectId ?? (sprint.projects.length === 1 ? sprint.projects[0]?.id : undefined);
  if (only) return { projectId: only };
  const spaces = [...new Set(sprint.projects.map((p) => p.spaceId))];
  if (spaces.length <= 1) return spaces[0] ? { spaceId: spaces[0] } : null;
  const carriedIn = (spaceId: string) =>
    sprint.carried.filter((t) => t.project.spaceId === spaceId).length;
  const [busiest] = [...spaces].sort((a, b) => carriedIn(b) - carriedIn(a));
  return busiest ? { spaceId: busiest } : null;
}
