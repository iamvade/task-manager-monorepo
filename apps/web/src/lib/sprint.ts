import type { TFunction } from 'i18next';

/** A sprint's display name: its own, else "Sprint 14" / "14-р спринт". */
export function sprintLabel(
  t: TFunction,
  sprint: { name: string | null; number?: number | undefined },
): string {
  if (sprint.name) return sprint.name;
  return sprint.number === undefined ? '' : t('sprint.name', { number: sprint.number });
}
