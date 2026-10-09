import { useSearchParams } from 'react-router';

export const SORT_FIELDS = ['due', 'priority', 'created', 'manual'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const GROUP_FIELDS = ['status', 'assignee', 'priority', 'none'] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];

/** Query params that count as filters (phase 9 adds the rest of the Filter menu). */
export const FILTER_PARAMS = [
  'sprint',
  'status',
  'assignee',
  'priority',
  'tag',
  'dueFrom',
  'dueTo',
];

/** `sprint=none` = the user removed the default sprint filter; keeps it from re-applying. */
export const NO_SPRINT = 'none';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((v) => v === value) ?? fallback;
}

/** View state that lives in the URL so links are shareable: filters, sort, group. */
export function useViewParams() {
  const [params, setParams] = useSearchParams();
  const sprintParam = params.get('sprint');
  const sprintId = sprintParam && sprintParam !== NO_SPRINT ? sprintParam : null;

  function update(changes: Record<string, string | null>, replace = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace },
    );
  }

  return {
    params,
    sprintId,
    hasFilterParams: FILTER_PARAMS.some((key) => params.has(key)),
    activeFilterCount: sprintId ? 1 : 0,
    sort: pick(params.get('sort'), SORT_FIELDS, 'due'),
    group: pick(params.get('group'), GROUP_FIELDS, 'status'),
    update,
  };
}
