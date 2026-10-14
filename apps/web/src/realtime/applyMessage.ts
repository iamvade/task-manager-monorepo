import type {
  ProjectDetail,
  RealtimeServerMessage,
  RealtimeTaskMessage,
  SidebarResponse,
  TaskDetail,
  TaskListItem,
  TaskStatusRef,
} from '@kite/shared';
import type { Query, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys';
import { TASK_MUTATION } from '../api/taskCache';
import { useRealtimeStore, type EditedField } from '../stores/realtime';

/** Changes arriving this close together share one round of refetches. */
export const COALESCE_MS = 150;

/** Reports are costly to recompute: teammates' changes refresh them at most this often. */
export const REPORTS_THROTTLE_MS = 10_000;

type Patch = (task: TaskListItem) => TaskListItem;

/** What a batch of messages made stale. */
interface Pending {
  workspaceId: string;
  projects: Set<string>;
  tasks: Set<string>;
  activity: Set<string>;
  home: boolean;
  sidebar: boolean;
  inbox: boolean;
}

/**
 * Applies teammates' changes (realtime messages) to the query cache: cheap patches right away
 * (a card moving column, a deleted row disappearing, a comment count), then a coalesced refetch
 * of whatever the change can affect. Only active queries refetch; the rest just turn stale.
 *
 * While a task mutation of this tab is in flight, task caches are left alone: its `settle()`
 * refetches everything once it lands, and an earlier refetch would overwrite its optimistic edit.
 */
export function createMessageHandler(queryClient: QueryClient) {
  let pending: Pending | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const busy = () => queryClient.isMutating({ mutationKey: TASK_MUTATION }) > 0;

  /**
   * Report refetches per workspace, throttled: the first change refreshes right away, later
   * ones within REPORTS_THROTTLE_MS share one trailing refresh at the end of the window.
   */
  const reports = new Map<string, { last: number; timer?: ReturnType<typeof setTimeout> }>();
  const refreshReports = (workspaceId: string) => {
    let state = reports.get(workspaceId);
    if (!state) {
      state = { last: -Infinity };
      reports.set(workspaceId, state);
    }
    if (state.timer !== undefined) return;
    const s = state;
    const run = () => {
      s.timer = undefined;
      s.last = Date.now();
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportsOf(workspaceId) });
    };
    const wait = s.last + REPORTS_THROTTLE_MS - Date.now();
    if (wait <= 0) run();
    else s.timer = setTimeout(run, wait);
  };

  const mark = (workspaceId: string, edit: (p: Pending) => void) => {
    if (pending?.workspaceId !== workspaceId) {
      flush();
      pending = {
        workspaceId,
        projects: new Set(),
        tasks: new Set(),
        activity: new Set(),
        home: false,
        sidebar: false,
        inbox: false,
      };
    }
    edit(pending);
    clearTimeout(timer);
    timer = setTimeout(flush, COALESCE_MS);
  };

  function flush() {
    clearTimeout(timer);
    const p = pending;
    pending = null;
    if (!p) return;
    const ws = p.workspaceId;
    if (p.inbox) void queryClient.invalidateQueries({ queryKey: queryKeys.notificationsOf(ws) });
    if (p.sidebar) void queryClient.invalidateQueries({ queryKey: queryKeys.sidebar(ws) });
    if (busy()) return;
    if (p.projects.size > 0) {
      const spaces = spacesOf(queryClient, ws, p.projects);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.taskLists,
        predicate: (q) => {
          const [, , scope, id] = q.queryKey;
          if (typeof id !== 'string') return false;
          if (scope === 'project') return p.projects.has(id);
          return scope === 'space' && (spaces === null || spaces.has(id));
        },
      });
      for (const id of p.projects) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.project(id), exact: true });
      }
    }
    if (p.tasks.size > 0) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.taskDetails,
        predicate: (q: Query) => {
          const data = q.state.data as TaskDetail | undefined;
          return data !== undefined && p.tasks.has(data.id);
        },
      });
    }
    for (const id of p.activity) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskActivity(id) });
    }
    if (p.home) void queryClient.invalidateQueries({ queryKey: queryKeys.home(ws) });
  }

  function onTask(m: RealtimeTaskMessage) {
    noteEdits(queryClient, m);
    const quiet = busy();
    if (!quiet) patchNow(queryClient, m);
    refreshReports(m.workspaceId);
    mark(m.workspaceId, (p) => {
      p.home = true;
      p.activity.add(m.taskId);
      if (m.type === 'comment.created') return;
      p.projects.add(m.projectId);
      if (m.type === 'task.updated' && m.fromProjectId) p.projects.add(m.fromProjectId);
      p.tasks.add(m.taskId);
      // My Tasks count in the sidebar.
      if (m.type !== 'comment.changed' && m.type !== 'subtask.changed') p.sidebar = true;
    });
  }

  return {
    handle(message: RealtimeServerMessage) {
      switch (message.type) {
        case 'task.created':
        case 'task.updated':
        case 'task.moved':
        case 'task.deleted':
        case 'comment.created':
        case 'comment.changed':
        case 'subtask.changed':
          onTask(message);
          return;
        case 'notification.created':
          mark(message.workspaceId, (p) => {
            p.inbox = true;
            p.sidebar = true;
          });
          return;
        default:
          return;
      }
    },
    /** Applies whatever is still waiting (tests, teardown). */
    flush,
    dispose() {
      clearTimeout(timer);
      pending = null;
      for (const state of reports.values()) clearTimeout(state.timer);
      reports.clear();
    },
  };
}

/** Immediate cache edits that need no server data. */
function patchNow(queryClient: QueryClient, m: RealtimeTaskMessage) {
  switch (m.type) {
    case 'task.moved': {
      const status = statusRef(queryClient, m.projectId, m.statusId);
      patchRows(queryClient, m.taskId, (t) => ({
        ...t,
        position: m.position,
        ...(status && { status }),
      }));
      return;
    }
    case 'task.deleted':
      for (const [key, tasks] of queryClient.getQueriesData<TaskListItem[]>({
        queryKey: queryKeys.taskLists,
      })) {
        if (tasks?.some((t) => t.id === m.taskId)) {
          queryClient.setQueryData(
            key,
            tasks.filter((t) => t.id !== m.taskId),
          );
        }
      }
      // Someone looking at it sees the "deleted" banner right away.
      patchDetails(queryClient, m.taskId, (task) => ({
        ...task,
        deletedAt: new Date().toISOString(),
      }));
      return;
    case 'task.created':
      if (m.restored) patchDetails(queryClient, m.taskId, (task) => ({ ...task, deletedAt: null }));
      return;
    case 'comment.created':
      patchRows(queryClient, m.taskId, (t) => ({ ...t, commentCount: t.commentCount + 1 }), true);
      return;
    case 'task.updated':
      // Size and reviewer travel with the message; the refetch fills in the reviewer's name.
      if (m.size !== undefined || m.reviewerId !== undefined) {
        patchRows(
          queryClient,
          m.taskId,
          (t) => ({
            ...t,
            ...(m.size !== undefined && { size: m.size }),
            ...(m.reviewerId !== undefined && { reviewerId: m.reviewerId }),
          }),
          true,
        );
      }
      return;
    default:
      return;
  }
}

/** Patches the task's list rows (and its open detail with `detail`). */
function patchDetails(
  queryClient: QueryClient,
  taskId: string,
  patch: (task: TaskDetail) => TaskDetail,
) {
  for (const [key, task] of queryClient.getQueriesData<TaskDetail>({
    queryKey: queryKeys.taskDetails,
  })) {
    if (task?.id === taskId) queryClient.setQueryData(key, patch(task));
  }
}

function patchRows(queryClient: QueryClient, taskId: string, patch: Patch, detail = false) {
  for (const [key, tasks] of queryClient.getQueriesData<TaskListItem[]>({
    queryKey: queryKeys.taskLists,
  })) {
    if (tasks?.some((t) => t.id === taskId)) {
      queryClient.setQueryData(
        key,
        tasks.map((t) => (t.id === taskId ? patch(t) : t)),
      );
    }
  }
  if (!detail) return;
  for (const [key, task] of queryClient.getQueriesData<TaskDetail>({
    queryKey: queryKeys.taskDetails,
  })) {
    if (task?.id === taskId) queryClient.setQueryData(key, { ...task, ...patch(task) });
  }
}

/** The status a task moved to, from the project (or any cached row already in it). */
function statusRef(
  queryClient: QueryClient,
  projectId: string,
  statusId: string,
): TaskStatusRef | undefined {
  const project = queryClient.getQueryData<ProjectDetail>(queryKeys.project(projectId));
  const s = project?.statuses.find((x) => x.id === statusId);
  if (s) return { id: s.id, name: s.name, category: s.category, color: s.color };
  for (const [, tasks] of queryClient.getQueriesData<TaskListItem[]>({
    queryKey: queryKeys.taskLists,
  })) {
    const row = tasks?.find((t) => t.status.id === statusId);
    if (row) return row.status;
  }
  return undefined;
}

/** Spaces holding these projects (from the sidebar); null when unknown, i.e. every space. */
function spacesOf(
  queryClient: QueryClient,
  workspaceId: string,
  projectIds: ReadonlySet<string>,
): Set<string> | null {
  const sidebar = queryClient.getQueryData<SidebarResponse>(queryKeys.sidebar(workspaceId));
  if (!sidebar) return null;
  const spaces = new Set<string>();
  for (const id of projectIds) {
    const space = sidebar.spaces.find((s) => s.projects.some((p) => p.id === id));
    // An archived project or one created a moment ago isn't in the sidebar yet.
    if (!space) return null;
    spaces.add(space.id);
  }
  return spaces;
}

const EDITED_BY: Partial<Record<string, EditedField>> = {
  'title.changed': 'title',
  'status.changed': 'status',
  'priority.changed': 'priority',
  'due.changed': 'due',
  'assignee.added': 'assignees',
  'assignee.removed': 'assignees',
};

/** Remembers which drawer fields someone changed ("Edited by X just now", title conflicts). */
function noteEdits(queryClient: QueryClient, m: RealtimeTaskMessage) {
  let fields: EditedField[] = [];
  if (m.type === 'task.updated') {
    fields = [...new Set(m.changes.flatMap((c) => EDITED_BY[c] ?? []))];
  } else if (m.type === 'task.moved') {
    // A move inside the same status is just a reorder.
    const detail = queryClient
      .getQueriesData<TaskDetail>({ queryKey: queryKeys.taskDetails })
      .find(([, task]) => task?.id === m.taskId)?.[1];
    if (detail && detail.status.id !== m.statusId) fields = ['status'];
  }
  useRealtimeStore.getState().noteEdits(m.taskId, m.actorId, fields);
}
