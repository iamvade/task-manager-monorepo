import {
  taskDetailSchema,
  taskListItemSchema,
  type CreateTask,
  type Priority,
  type TaskListItem,
  type UpdateTask,
} from '@kite/shared';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { z } from 'zod';
import { ApiError, apiFetch, apiSend, toQuery } from './client';
import { queryKeys } from './queryKeys';

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

type ListSnapshot = [readonly unknown[], TaskListItem[] | undefined][];

/** Applies `update` to every cached task list; returns the previous lists for rollback. */
async function patchLists(
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

function restore(queryClient: QueryClient, snapshot: ListSnapshot | undefined) {
  for (const [key, tasks] of snapshot ?? []) queryClient.setQueryData(key, tasks);
}

const replaceTask = (tasks: TaskListItem[], id: string, next: TaskListItem) =>
  tasks.map((t) => (t.id === id ? next : t));

/** Server copy of a mutated task, written into every list that shows it. */
function writeResult(queryClient: QueryClient, id: string, result: TaskListItem) {
  const row = taskListItemSchema.parse(result);
  for (const [key, tasks] of queryClient.getQueriesData<TaskListItem[]>({
    queryKey: queryKeys.taskLists,
  })) {
    if (tasks) queryClient.setQueryData(key, replaceTask(tasks, id, row));
  }
}

const TASK_MUTATION = ['tasks'] as const;

/**
 * Refetches task lists/details, project counts and the sidebar badge once the last task
 * mutation in flight settles (earlier refetches would overwrite later optimistic edits).
 */
function settle(queryClient: QueryClient) {
  if (queryClient.isMutating({ mutationKey: TASK_MUTATION }) > 1) return;
  void queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
  void queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[0] === 'workspaces' && q.queryKey[2] === 'sidebar',
  });
}

/**
 * An optimistic edit of one task: `optimistic` patches the cached row right away; the
 * server's row replaces it on success; errors roll every list back.
 */
function useTaskMutation<V extends { task: TaskListItem }>(
  mutationFn: (vars: V) => Promise<TaskListItem | null>,
  optimistic: (task: TaskListItem, vars: V) => TaskListItem,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: TASK_MUTATION,
    mutationFn,
    onMutate: async (vars) => ({
      snapshot: await patchLists(queryClient, (tasks) =>
        tasks.map((t) => (t.id === vars.task.id ? optimistic(t, vars) : t)),
      ),
    }),
    onError: (_err, _vars, context) => {
      restore(queryClient, context?.snapshot);
    },
    onSuccess: (result, vars) => {
      if (result) writeResult(queryClient, vars.task.id, result);
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

type FieldPatch = Pick<UpdateTask, 'priority' | 'dueDate'>;

/** Priority / due date from the list cells: `PATCH /tasks/:id`. */
export function useUpdateTask() {
  return useTaskMutation(
    ({ task, patch }: { task: TaskListItem; patch: FieldPatch }) =>
      apiSend(`/tasks/${task.id}`, taskDetailSchema, 'PATCH', patch),
    (t, { patch }) => ({
      ...t,
      ...(patch.priority ? { priority: patch.priority satisfies Priority } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
    }),
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
      restore(queryClient, context?.snapshot);
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
      restore(queryClient, context?.snapshot);
    },
    onSuccess: (created, { optimistic }) => {
      writeResult(queryClient, optimistic.id, created);
    },
    onSettled: () => {
      settle(queryClient);
    },
  });
}

export const isTempTask = (task: Pick<TaskListItem, 'id'>) => task.id.startsWith('temp-');
