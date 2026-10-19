import { STATUS_CATEGORIES, UNASSIGNED } from '@kite/shared';
import type { TaskListParams } from '../../api/tasks';
import { ASSIGNEE_ME, type ViewFilters } from './useViewParams';

// A hand-edited link with a bad id shouldn't turn the whole list into a 400.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (values: string[]) => values.filter((v) => UUID.test(v));

export type ListScope = 'project' | 'space';

/**
 * URL filters → list endpoint query. `me` becomes the viewer's id; the space list filters
 * statuses by category. Sort is applied client-side (so optimistic edits re-sort and switching
 * the sort doesn't refetch), hence not sent. `doneSince` (List/Board) drops older done tasks.
 */
export function toTaskQuery(
  filters: ViewFilters,
  meId: string,
  scope: ListScope,
  doneSince: string | null = null,
): TaskListParams {
  const query: TaskListParams = {};
  if (scope === 'space') {
    const categories = filters.status.filter((s) => STATUS_CATEGORIES.some((c) => c === s));
    if (categories.length) query.statusCategory = categories;
  } else if (ids(filters.status).length) {
    query.statusId = ids(filters.status);
  }
  const assignees = filters.assignee
    .map((a) => (a === ASSIGNEE_ME ? meId : a))
    .filter((a) => a === UNASSIGNED || UUID.test(a));
  if (assignees.length) query.assigneeId = assignees;
  const creators = filters.creator
    .map((a) => (a === ASSIGNEE_ME ? meId : a))
    .filter((a) => UUID.test(a));
  if (creators.length) query.createdBy = creators;
  if (filters.priority.length) query.priority = filters.priority;
  if (ids(filters.tag).length) query.tagId = ids(filters.tag);
  if (filters.sprint && UUID.test(filters.sprint)) query.sprintId = filters.sprint;
  if (filters.dueFrom) query.dueFrom = filters.dueFrom;
  if (filters.dueTo) query.dueTo = filters.dueTo;
  if (doneSince) query.doneSince = doneSince;
  return query;
}
