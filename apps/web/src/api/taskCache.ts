import type { TaskDetail, TaskListItem } from '@kite/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

// Optimistic edits of one task write into every cached copy of it — the list/board rows behind
// the drawer and the open detail — so the whole screen moves together; errors roll all back.

export type ListSnapshot = [readonly unknown[], TaskListItem[] | undefined][];
type DetailSnapshot = [readonly unknown[], TaskDetail | undefined][];

export interface TaskSnapshot {
  lists: ListSnapshot;
  details: DetailSnapshot;
}

/** Mutation key of every task write (task fields, subtasks, comments, attachments). */
export const TASK_MUTATION = ['tasks'] as const;

/** Applies `update` to every cached task list; returns the previous lists for rollback. */
export async function patchLists(
  queryClient: QueryClient,
  update: (tasks: TaskListItem[], key: readonly unknown[]) => TaskListItem[],
): Promise<ListSnapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.taskLists });
  const snapshot = queryClient.getQueriesData<TaskListItem[]>({ queryKey: queryKeys.taskLists });
  for (const [key, tasks] of snapshot) {
    if (tasks) queryClient.setQueryData(key, update(tasks, key));
  }
  return snapshot;
}

/** Applies `update` to the cached detail(s) of `taskId` (keyed by KEY or id). */
export async function patchDetail(
  queryClient: QueryClient,
  taskId: string,
  update: (task: TaskDetail) => TaskDetail,
): Promise<DetailSnapshot> {
  await queryClient.cancelQueries({ queryKey: queryKeys.taskDetails });
  const snapshot = queryClient
    .getQueriesData<TaskDetail>({ queryKey: queryKeys.taskDetails })
    .filter(([, task]) => task?.id === taskId);
  for (const [key, task] of snapshot) {
    if (task) queryClient.setQueryData(key, update(task));
  }
  return snapshot;
}

/** Patches one task in the lists (`row`) and in its detail (`detail`, default: same as row). */
export async function patchTask(
  queryClient: QueryClient,
  taskId: string,
  row: ((task: TaskListItem) => TaskListItem) | null,
  detail?: (task: TaskDetail) => TaskDetail,
): Promise<TaskSnapshot> {
  const lists = row
    ? await patchLists(queryClient, (tasks) => tasks.map((t) => (t.id === taskId ? row(t) : t)))
    : [];
  const details = await patchDetail(
    queryClient,
    taskId,
    detail ?? ((task) => (row ? { ...task, ...row(task) } : task)),
  );
  return { lists, details };
}

export function restoreLists(queryClient: QueryClient, snapshot: ListSnapshot | undefined) {
  for (const [key, tasks] of snapshot ?? []) queryClient.setQueryData(key, tasks);
}

export function restoreTask(queryClient: QueryClient, snapshot: TaskSnapshot | undefined) {
  restoreLists(queryClient, snapshot?.lists);
  for (const [key, task] of snapshot?.details ?? []) queryClient.setQueryData(key, task);
}

/** Merges a server copy (list row or full detail) into every cached copy of the task. */
export function writeTask(queryClient: QueryClient, id: string, result: TaskListItem) {
  for (const [key, tasks] of queryClient.getQueriesData<TaskListItem[]>({
    queryKey: queryKeys.taskLists,
  })) {
    if (!tasks) continue;
    queryClient.setQueryData(
      key,
      tasks.map((t) => (t.id === id ? pickListFields(t, result) : t)),
    );
  }
  for (const [key, task] of queryClient.getQueriesData<TaskDetail>({
    queryKey: queryKeys.taskDetails,
  })) {
    if (task?.id === id) {
      queryClient.setQueryData(key, { ...task, ...result });
    }
  }
}

/** A detail response carries more than a list row; lists keep only the row's fields. */
function pickListFields(row: TaskListItem, result: TaskListItem): TaskListItem {
  const next = { ...row };
  for (const key of Object.keys(row) as (keyof TaskListItem)[]) {
    (next as Record<string, unknown>)[key] = result[key];
  }
  return next;
}

/** Bumps a count on the task's list rows and detail (comments, attachments). */
export function bumpCount(
  queryClient: QueryClient,
  taskId: string,
  field: 'commentCount' | 'attachmentCount',
  delta: number,
) {
  return patchTask(queryClient, taskId, (t) => ({ ...t, [field]: Math.max(0, t[field] + delta) }));
}

/**
 * Refetches task lists/details/activity, project counts and the sidebar badge once the last task
 * mutation in flight settles (earlier refetches would overwrite later optimistic edits).
 */
export function settle(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: TASK_MUTATION }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'workspaces' && q.queryKey[2] === 'sidebar',
  });
}
