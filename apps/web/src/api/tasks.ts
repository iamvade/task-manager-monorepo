import {
  taskDetailSchema,
  taskListItemSchema,
  type CreateTask,
  type TaskDetail,
  type TaskListItem,
  type UpdateTask,
} from '@kite/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend, toQuery } from './client';
import { queryKeys } from './queryKeys';
import {
  TASK_MUTATION,
  patchLists,
  patchTask,
  restoreLists,
  restoreTask,
  settle,
  writeTask,
} from './taskCache';

/** Filters sent to the list endpoints (built by `toTaskQuery`); also part of the query key. */
export type TaskListParams = Record<string, string | readonly string[] | undefined>;

const taskList = z.array(taskListItemSchema);

export function useProjectTasks(projectId: string | undefined, params: TaskListParams) {
  return useQuery({
    queryKey: queryKeys.projectTasks(projectId ?? '', params),
    queryFn: () => apiFetch(`/projects/${projectId ?? ''}/tasks${toQuery(params)}`, taskList),
    enabled: Boolean(projectId),
    // Changing a filter keeps the old rows on screen until the new ones arrive.
    placeholderData: keepPreviousData,
  });
}

export function useSpaceTasks(spaceId: string | undefined, params: TaskListParams) {
  return useQuery({
    queryKey: queryKeys.spaceTasks(spaceId ?? '', params),
    queryFn: () => apiFetch(`/spaces/${spaceId ?? ''}/tasks${toQuery(params)}`, taskList),
    enabled: Boolean(spaceId),
    placeholderData: keepPreviousData,
  });
}

/** `APP-142` or a task id (drawer, full page). */
export function useTask(ref: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.task(ref ?? ''),
    queryFn: () => apiFetch(`/tasks/${encodeURIComponent(ref ?? '')}`, taskDetailSchema),
    enabled: Boolean(ref),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

/**
 * An optimistic edit of one task: `optimistic` patches every cached copy (list rows and the
 * open detail) right away; the server's copy replaces it on success; errors roll it all back.
 */
function useTaskMutation<V extends { task: TaskListItem }>(
  mutationFn: (vars: V) => Promise<TaskListItem | null>,
  optimistic: (task: TaskListItem, vars: V) => TaskListItem,
  optimisticDetail?: (task: TaskDetail, vars: V) => TaskDetail,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn,
    onMutate: async (vars) => ({
      snapshot: await patchTask(
        queryClient,
        vars.task.id,
        (t) => optimistic(t, vars),
        (d) => {
          const next = { ...d, ...optimistic(d, vars) };
          return optimisticDetail ? optimisticDetail(next, vars) : next;
        },
      ),
    }),
    onError: (_err, _vars, context) => {
      restoreTask(queryClient, context?.snapshot);
    },
    onSuccess: (result, vars) => {
      if (result) writeTask(queryClient, vars.task.id, taskListItemSchema.parse(result));
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export interface CompleteVars {
  task: TaskListItem;
  done: boolean;
  /** Where the row goes until the server answers (status + position), if known. */
  optimistic: Pick<TaskListItem, 'status' | 'position'>;
}

/** Checkbox: `POST /tasks/:id/complete` (to the first Done status / back to where it was). */
export function useCompleteTask() {
  return useTaskMutation(
    ({ task, done }: CompleteVars) =>
      apiSend(`/tasks/${task.id}/complete`, taskListItemSchema, 'POST', { done }),
    (t, { done, optimistic }) => ({
      ...t,
      ...optimistic,
      completedAt: done ? new Date().toISOString() : null,
    }),
  );
}

export interface MoveVars {
  task: TaskListItem;
  status: TaskListItem['status'];
  prevId: string | null;
  nextId: string | null;
  /** Fractional key between the neighbours, for the optimistic row. */
  position: string;
}

/** Drag and drop: `POST /tasks/:id/move` with the neighbours after the drop. */
export function useMoveTask() {
  return useTaskMutation(
    ({ task, status, prevId, nextId }: MoveVars) =>
      apiSend(`/tasks/${task.id}/move`, taskListItemSchema, 'POST', {
        statusId: status.id,
        prevId,
        nextId,
      }),
    (t, { status, position }) => ({
      ...t,
      status,
      position,
      completedAt: status.category === 'done' ? (t.completedAt ?? new Date().toISOString()) : null,
    }),
  );
}

export interface UpdateVars {
  task: TaskListItem;
  patch: UpdateTask;
  /** The new status object when `patch.statusId` is set (for the optimistic rows). */
  status?: TaskListItem['status'];
}

/** Task fields (list cells, drawer): `PATCH /tasks/:id`. */
export function useUpdateTask() {
  return useTaskMutation(
    ({ task, patch }: UpdateVars) => apiSend(`/tasks/${task.id}`, taskDetailSchema, 'PATCH', patch),
    (t, { patch, status }) => {
      const next: TaskListItem = { ...t, updatedAt: new Date().toISOString() };
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.priority !== undefined) next.priority = patch.priority;
      if (patch.dueDate !== undefined) next.dueDate = patch.dueDate;
      if (patch.startDate !== undefined) next.startDate = patch.startDate;
      if (patch.sprintId !== undefined) next.sprintId = patch.sprintId;
      if (patch.statusId !== undefined && status) {
        next.status = status;
        const done = status.category === 'done';
        next.completedAt = done ? (t.completedAt ?? new Date().toISOString()) : null;
      }
      return next;
    },
    (d, { patch }) =>
      patch.description === undefined ? d : { ...d, description: patch.description },
  );
}

/** Replaces the assignee set: `PUT /tasks/:id/assignees`. */
export function useSetAssignees() {
  return useTaskMutation(
    ({ task, users }: { task: TaskListItem; users: TaskListItem['assignees'] }) =>
      apiSend(`/tasks/${task.id}/assignees`, taskListItemSchema, 'PUT', {
        userIds: users.map((u) => u.id),
      }),
    (t, { users }) => ({
      ...t,
      assignees: [...users].sort((a, b) => a.name.localeCompare(b.name)),
    }),
  );
}

/** Replaces the tag set: `PUT /tasks/:id/tags`. */
export function useSetTags() {
  return useTaskMutation(
    ({ task, tags }: { task: TaskListItem; tags: TaskListItem['tags'] }) =>
      apiSend(`/tasks/${task.id}/tags`, taskListItemSchema, 'PUT', {
        tagIds: tags.map((tag) => tag.id),
      }),
    (t, { tags }) => ({ ...t, tags: [...tags].sort((a, b) => a.name.localeCompare(b.name)) }),
  );
}

/** Soft delete (restorable); the row disappears right away. */
export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: (task: TaskListItem) => apiSend(`/tasks/${task.id}`, z.null(), 'DELETE'),
    onMutate: async (task) => ({
      snapshot: await patchLists(queryClient, (tasks) => tasks.filter((t) => t.id !== task.id)),
    }),
    onError: (_err, _task, context) => {
      restoreLists(queryClient, context?.snapshot);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

/** Undo of a delete: `POST /tasks/:id/restore` (back to its old status and position). */
export function useRestoreTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: (task: Pick<TaskListItem, 'id'>) =>
      apiSend(`/tasks/${task.id}/restore`, taskDetailSchema, 'POST'),
    onSettled: () => {
      settle(queryClient);
    },
  });
}

/** Drawer "Duplicate": `POST /tasks/:id/duplicate` (same project, right after the original). */
export function useDuplicateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ task, title }: { task: Pick<TaskListItem, 'id'>; title: string }) =>
      apiSend(`/tasks/${task.id}/duplicate`, taskDetailSchema, 'POST', { title }),
    onSuccess: (copy) => {
      queryClient.setQueryData(queryKeys.task(copy.key), copy);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

/** Drawer "Move to project": the task gets a new key there; the old key stops resolving. */
export function useMoveTaskToProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ task, projectId }: { task: Pick<TaskListItem, 'id'>; projectId: string }) =>
      apiSend(`/tasks/${task.id}/move-to-project`, taskDetailSchema, 'POST', { projectId }),
    onMutate: async ({ task }) => ({
      snapshot: await patchLists(queryClient, (tasks) => tasks.filter((t) => t.id !== task.id)),
    }),
    onError: (_err, _vars, context) => {
      restoreLists(queryClient, context?.snapshot);
    },
    onSuccess: (moved) => {
      queryClient.setQueryData(queryKeys.task(moved.key), moved);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export interface CreateVars {
  body: CreateTask;
  /** Temporary row (id `temp-…`) shown in the project's lists until the server answers. */
  optimistic: TaskListItem;
}

/** Inline "Add task": `POST /projects/:id/tasks`. */
export function useCreateTask(projectId: string) {
  const queryClient = useQueryClient();
  const inProject = (key: readonly unknown[]) => key[2] === 'project' && key[3] === projectId;
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn: ({ body }: CreateVars) =>
      apiSend(`/projects/${projectId}/tasks`, taskDetailSchema, 'POST', body),
    onMutate: async ({ optimistic }) => ({
      snapshot: await patchLists(queryClient, (tasks, key) =>
        inProject(key) ? [...tasks, optimistic] : tasks,
      ),
    }),
    onError: (_err, _vars, context) => {
      restoreLists(queryClient, context?.snapshot);
    },
    onSuccess: (created, { optimistic }) => {
      writeTask(queryClient, optimistic.id, created);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export const isTempTask = (task: Pick<TaskListItem, 'id'>) => task.id.startsWith('temp-');
