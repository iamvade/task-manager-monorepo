import {
  PRIORITIES,
  STATUS_CATEGORIES,
  type Priority,
  type Status,
  type StatusCategory,
  type TaskListItem,
  type UserRef,
} from '@kite/shared';
import type { GroupField, SortField } from '../views/useViewParams';

/** What the group header draws before its label. */
export type GroupMarker =
  | { kind: 'status'; category: StatusCategory }
  | { kind: 'user'; user: UserRef }
  | { kind: 'unassigned' }
  | { kind: 'priority'; priority: Priority }
  | { kind: 'none' };

export type GroupLabelKey =
  `status.${StatusCategory}` | `priority.${Priority}` | 'table.noAssignee';

export interface TaskGroup {
  /** Stable id within the list (`status:<id>`, `category:done`, `assignee:<id>` …). */
  key: string;
  /** Untranslated label: a status name, or null to use `labelKey`. */
  name: string | null;
  /** i18n key when `name` is null (`status.todo`, `priority.high`, `table.noAssignee`). */
  labelKey: GroupLabelKey | null;
  marker: GroupMarker;
  tasks: TaskListItem[];
  /** Done groups start collapsed. */
  defaultCollapsed: boolean;
  /** Fields a task created in this group gets; null = no inline add (space list). */
  defaults: { statusId?: string; assigneeIds?: string[]; priority?: Priority } | null;
  /** Status a task dropped into this group moves to (status grouping only). */
  status: Status | null;
}

const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i])) as Record<
  Priority,
  number
>;

const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Client-side order mirroring the API's (`apps/api/src/tasks/list.ts`): the sort field, then
 * position, then id. Manual = status position, then position. `statusRank` is unknown for the
 * space list, where manual keeps the server order (project, status, position).
 */
export function sortTasks(
  tasks: readonly TaskListItem[],
  sort: SortField,
  statusRank: ReadonlyMap<string, number> | null,
): TaskListItem[] {
  const tail = (a: TaskListItem, b: TaskListItem) =>
    byKey(a.position, b.position) || byKey(a.id, b.id);
  const compare = (a: TaskListItem, b: TaskListItem): number => {
    switch (sort) {
      case 'manual':
        if (!statusRank) return 0;
        return (
          (statusRank.get(a.status.id) ?? 0) - (statusRank.get(b.status.id) ?? 0) || tail(a, b)
        );
      case 'due':
        if (a.dueDate !== b.dueDate) {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return byKey(a.dueDate, b.dueDate);
        }
        return tail(a, b);
      case 'priority':
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || tail(a, b);
      case 'created':
        // Newest first.
        return byKey(b.createdAt, a.createdAt) || tail(a, b);
    }
  };
  return [...tasks].sort(compare);
}

interface GroupContext {
  /** Project statuses by position; null for the space list (groups = categories). */
  statuses: readonly Status[] | null;
}

/** Splits sorted tasks into List groups. Status groups always all show (drop targets). */
export function groupTasks(
  tasks: readonly TaskListItem[],
  group: GroupField,
  { statuses }: GroupContext,
): TaskGroup[] {
  const base = { defaultCollapsed: false, status: null, name: null, labelKey: null } as const;
  switch (group) {
    case 'status':
      if (!statuses) {
        return STATUS_CATEGORIES.map((category) => ({
          ...base,
          key: `category:${category}`,
          labelKey: `status.${category}`,
          marker: { kind: 'status', category },
          tasks: tasks.filter((t) => t.status.category === category),
          defaultCollapsed: category === 'done',
          defaults: null,
        }));
      }
      return statuses.map((status) => ({
        ...base,
        key: `status:${status.id}`,
        name: status.name,
        labelKey: status.name ? null : (`status.${status.category}` as const),
        marker: { kind: 'status', category: status.category },
        tasks: tasks.filter((t) => t.status.id === status.id),
        defaultCollapsed: status.category === 'done',
        defaults: { statusId: status.id },
        status,
      }));

    case 'assignee': {
      const people = new Map<string, UserRef>();
      for (const task of tasks) for (const user of task.assignees) people.set(user.id, user);
      const groups: TaskGroup[] = [...people.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((user) => ({
          ...base,
          key: `assignee:${user.id}`,
          name: user.name,
          marker: { kind: 'user', user },
          // A task with two assignees shows in both groups.
          tasks: tasks.filter((t) => t.assignees.some((a) => a.id === user.id)),
          defaults: statuses ? { assigneeIds: [user.id] } : null,
        }));
      const unassigned = tasks.filter((t) => t.assignees.length === 0);
      if (unassigned.length) {
        groups.push({
          ...base,
          key: 'assignee:none',
          labelKey: 'table.noAssignee',
          marker: { kind: 'unassigned' },
          tasks: unassigned,
          defaults: statuses ? {} : null,
        });
      }
      return groups;
    }

    case 'priority':
      return PRIORITIES.map((priority): TaskGroup => ({
        ...base,
        key: `priority:${priority}`,
        labelKey: `priority.${priority}`,
        marker: { kind: 'priority', priority },
        tasks: tasks.filter((t) => t.priority === priority),
        defaults: statuses ? { priority } : null,
      })).filter((g) => g.tasks.length > 0);

    case 'none':
      return [
        {
          ...base,
          key: 'all',
          marker: { kind: 'none' },
          tasks: [...tasks],
          defaults: statuses ? {} : null,
        },
      ];
  }
}
