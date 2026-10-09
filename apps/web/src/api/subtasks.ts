import { subtaskSchema, type Subtask, type TaskDetail, type UserRef } from '@kite/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateKeyBetween } from 'fractional-indexing';
import { z } from 'zod';
import { apiSend } from './client';
import { TASK_MUTATION, patchTask, restoreTask, settle } from './taskCache';

type Progress = TaskDetail['subtaskProgress'];

export const isTempSubtask = (s: Pick<Subtask, 'id'>) => s.id.startsWith('temp-');

const byPosition = (a: Subtask, b: Subtask) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0;

const count = (subtasks: readonly Subtask[]): Progress => ({
  done: subtasks.filter((s) => s.done).length,
  total: subtasks.length,
});

/**
 * Optimistic subtask edit: rewrites `detail.subtasks` and the "3/5" progress on the task's
 * list rows and detail; rolls back on error, refetches when the last task write settles.
 */
function useSubtaskMutation<V extends { taskId: string }, R>(
  mutationFn: (vars: V) => Promise<R>,
  edit: (subtasks: Subtask[], vars: V) => Subtask[],
  onSuccess?: (result: R, vars: V, client: ReturnType<typeof useQueryClient>) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn,
    onMutate: async (vars) => {
      let progress: Progress | undefined;
      const snapshot = await patchTask(queryClient, vars.taskId, null, (d) => {
        const subtasks = edit(d.subtasks, vars).sort(byPosition);
        progress = count(subtasks);
        return { ...d, subtasks, subtaskProgress: progress };
      });
      const lists = progress
        ? await patchTask(queryClient, vars.taskId, (t) => ({
            ...t,
            subtaskProgress: progress ?? t.subtaskProgress,
          }))
        : undefined;
      return { snapshot: { lists: lists?.lists ?? [], details: snapshot.details } };
    },
    onError: (_err, _vars, context) => {
      restoreTask(queryClient, context?.snapshot);
    },
    onSuccess: (result, vars) => {
      onSuccess?.(result, vars, queryClient);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export interface CreateSubtaskVars {
  taskId: string;
  title: string;
  /** Temp id for the optimistic row (`temp-…`). */
  tempId: string;
}

/** "Add subtask": `POST /tasks/:id/subtasks` at the end. */
export function useCreateSubtask() {
  return useSubtaskMutation(
    ({ taskId, title }: CreateSubtaskVars) =>
      apiSend(`/tasks/${taskId}/subtasks`, subtaskSchema, 'POST', { title, position: 'bottom' }),
    (subtasks, { title, tempId }) => [
      ...subtasks,
      {
        id: tempId,
        title,
        assignee: null,
        dueDate: null,
        done: false,
        position: generateKeyBetween(subtasks.at(-1)?.position ?? null, null),
      },
    ],
    (created, { taskId, tempId }, queryClient) => {
      void patchTask(queryClient, taskId, null, (d) => ({
        ...d,
        subtasks: d.subtasks.map((s) => (s.id === tempId ? created : s)),
      }));
    },
  );
}

export interface UpdateSubtaskVars {
  taskId: string;
  subtaskId: string;
  patch: Partial<Pick<Subtask, 'title' | 'done' | 'dueDate'>> & { assignee?: UserRef | null };
}

/** Check off, rename, (un)assign, due: `PATCH /subtasks/:id`. */
export function useUpdateSubtask() {
  return useSubtaskMutation(
    ({ subtaskId, patch: { assignee, ...rest } }: UpdateSubtaskVars) =>
      apiSend(`/subtasks/${subtaskId}`, subtaskSchema, 'PATCH', {
        ...rest,
        ...(assignee !== undefined ? { assigneeId: assignee?.id ?? null } : {}),
      }),
    (subtasks, { subtaskId, patch }) =>
      subtasks.map((s) => (s.id === subtaskId ? { ...s, ...patch } : s)),
  );
}

export interface MoveSubtaskVars {
  taskId: string;
  subtaskId: string;
  prevId: string | null;
  nextId: string | null;
}

/** Drag to reorder: `POST /subtasks/:id/move` with the neighbours after the drop. */
export function useMoveSubtask() {
  return useSubtaskMutation(
    ({ subtaskId, prevId, nextId }: MoveSubtaskVars) =>
      apiSend(`/subtasks/${subtaskId}/move`, subtaskSchema, 'POST', { prevId, nextId }),
    (subtasks, { subtaskId, prevId, nextId }) => {
      const at = (id: string | null) => (id ? subtasks.find((s) => s.id === id) : undefined);
      const position = generateKeyBetween(
        at(prevId)?.position ?? null,
        at(nextId)?.position ?? null,
      );
      return subtasks.map((s) => (s.id === subtaskId ? { ...s, position } : s));
    },
  );
}

/** `DELETE /subtasks/:id` (permanent). */
export function useDeleteSubtask() {
  return useSubtaskMutation(
    ({ subtaskId }: { taskId: string; subtaskId: string }) =>
      apiSend(`/subtasks/${subtaskId}`, z.null(), 'DELETE'),
    (subtasks, { subtaskId }) => subtasks.filter((s) => s.id !== subtaskId),
  );
}
