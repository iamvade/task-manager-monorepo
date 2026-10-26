import { taskListItemSchema, type BatchTaskUpdate, type TaskListItem } from '@kite/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiSend } from './client';
import { patchLists, restoreLists, settle, writeTask } from './taskCache';
import { TASK_MUTATION } from '@kite/shared/client';

export interface BatchUpdateVars {
  updates: BatchTaskUpdate[];
  /** What each row looks like until the server answers (status/assignee objects, …). */
  optimistic: ReadonlyMap<string, Partial<TaskListItem>>;
}

/**
 * List multi-select: `POST /projects/:id/tasks/batch`. Every selected row changes at once and
 * rolls back together on error; the server's rows replace the optimistic ones.
 */
export function useBatchUpdate(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ updates }: BatchUpdateVars) =>
      apiSend(`/projects/${projectId}/tasks/batch`, z.array(taskListItemSchema), 'POST', {
        updates,
      }),
    onMutate: async ({ optimistic }) => ({
      snapshot: await patchLists(queryClient, (tasks) =>
        tasks.map((t) => {
          const patch = optimistic.get(t.id);
          return patch ? { ...t, ...patch } : t;
        }),
      ),
    }),
    onError: (_err, _vars, context) => {
      restoreLists(queryClient, context?.snapshot);
    },
    onSuccess: (rows) => {
      for (const row of rows) writeTask(queryClient, row.id, row);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

/** `batch-delete` (rows leave right away) and its Undo, `batch-restore`. */
export function useBatchDelete(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: (ids: readonly string[]) =>
      apiSend(`/projects/${projectId}/tasks/batch-delete`, z.null(), 'POST', { ids }),
    onMutate: async (ids) => {
      const gone = new Set(ids);
      return {
        snapshot: await patchLists(queryClient, (tasks) => tasks.filter((t) => !gone.has(t.id))),
      };
    },
    onError: (_err, _ids, context) => {
      restoreLists(queryClient, context?.snapshot);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export function useBatchRestore(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: (ids: readonly string[]) =>
      apiSend(`/projects/${projectId}/tasks/batch-restore`, z.null(), 'POST', { ids }),
    onSettled: () => {
      settle(queryClient);
    },
  });
}
