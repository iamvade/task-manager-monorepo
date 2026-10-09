import { PRIORITIES, type Priority } from '@kite/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useCurrentView } from './useCurrentView';

export const SORT_FIELDS = ['due', 'priority', 'created', 'manual'] as const;
export type SortField = (typeof SORT_FIELDS)[number];
export const GROUP_FIELDS = ['status', 'assignee', 'priority', 'none'] as const;
export type GroupField = (typeof GROUP_FIELDS)[number];

/** Query params that count as filters. */
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
/** `assignee=me` stays literal in the URL so a shared link means "the viewer". */
export const ASSIGNEE_ME = 'me';

/** Filter values read from the URL (lists are comma-separated: `?status=a,b`). */
export interface ViewFilters {
  /** Status ids (project) or status categories (space). */
  status: string[];
  /** User ids, `me`, `unassigned`. */
  assignee: string[];
  priority: Priority[];
  tag: string[];
  sprint: string | null;
  dueFrom: string | null;
  dueTo: string | null;
}

/** Filter fields shown as chips / counted on the Filter button. */
export type FilterField = 'status' | 'assignee' | 'priority' | 'tag' | 'sprint' | 'due';

const list = (value: string | null) => (value ? value.split(',').filter(Boolean) : []);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const date = (value: string | null) => (value && DATE.test(value) ? value : null);

export function readFilters(params: URLSearchParams): ViewFilters {
  const sprint = params.get('sprint');
  return {
    status: list(params.get('status')),
    assignee: list(params.get('assignee')),
    priority: list(params.get('priority')).filter((p): p is Priority =>
      PRIORITIES.some((x) => x === p),
    ),
    tag: list(params.get('tag')),
    sprint: sprint && sprint !== NO_SPRINT ? sprint : null,
    dueFrom: date(params.get('dueFrom')),
    dueTo: date(params.get('dueTo')),
  };
}

export function activeFilterFields(filters: ViewFilters): FilterField[] {
  const fields: FilterField[] = [];
  if (filters.sprint) fields.push('sprint');
  if (filters.status.length) fields.push('status');
  if (filters.assignee.length) fields.push('assignee');
  if (filters.priority.length) fields.push('priority');
  if (filters.tag.length) fields.push('tag');
  if (filters.dueFrom || filters.dueTo) fields.push('due');
  return fields;
}

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((v) => v === value) ?? fallback;
}

/** View state that lives in the URL so links are shareable: filters, sort, group. */
export function useViewParams() {
  const [params, setParams] = useSearchParams();
  // The board shows manual (column) order unless a sort is picked (Board.dc.html "Sort: Manual").
  const defaultSort: SortField = useCurrentView() === 'board' ? 'manual' : 'due';
  const filters = useMemo(() => readFilters(params), [params]);

  const update = useCallback(
    (changes: Record<string, string | readonly string[] | null>, replace = false) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            const text = typeof value === 'string' || value === null ? value : value.join(',');
            if (!text) next.delete(key);
            else next.set(key, text);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  return {
    params,
    filters,
    sprintId: filters.sprint,
    hasFilterParams: FILTER_PARAMS.some((key) => params.has(key)),
    activeFilterCount: activeFilterFields(filters).length,
    defaultSort,
    sort: pick(params.get('sort'), SORT_FIELDS, defaultSort),
    group: pick(params.get('group'), GROUP_FIELDS, 'status'),
    update,
  };
}
