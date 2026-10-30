import type { Query, QueryClient } from '@tanstack/query-core';
import type { ProjectDetail } from '../schemas/project.js';
import type { RealtimeServerMessage, RealtimeTaskMessage } from '../schemas/realtime.js';
import type { StandupMeeting, StandupMeetingState } from '../schemas/standup.js';
import type { TaskDetail, TaskListItem, TaskStatusRef } from '../schemas/task.js';
import type { SidebarResponse } from '../schemas/workspace.js';
import { TASK_MUTATION, queryKeys } from './query-keys.js';

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
  /** A tag was created, renamed, recolored, merged or deleted. */
  tags: boolean;
  /** Feedback arrived or was triaged. */
  feedback: boolean;
  /** Standup blockers changed the "Blocked" marker of tasks in unknown projects. */
  allLists: boolean;
}

/**
 * Applies teammates' changes (realtime messages) to the query cache: cheap patches right away
 * (a card moving column, a deleted row disappearing, a comment count), then a coalesced refetch
 * of whatever the change can affect. Only active queries refetch; the rest just turn stale.
 *
 * While a task mutation of this tab is in flight, task caches are left alone: its `settle()`
 * refetches everything once it lands, and an earlier refetch would overwrite its optimistic edit.
 */
export function createMessageHandler(
  queryClient: QueryClient,
  options: { onRecentEdit?: RecentEditListener } = {},
) {
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
        tags: false,
        feedback: false,
        allLists: false,
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
    if (p.tags) void queryClient.invalidateQueries({ queryKey: queryKeys.tags(ws) });
    if (p.feedback) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackOf(ws) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.feedbackOptionsAll });
    }
    if (busy()) return;
    if (p.tags) {
      // Chips on every list, open drawer and My Tasks show the tag's name and color.
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetails });
      p.home = true;
    }
    if (p.allLists) void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
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
    const fields = editedFields(queryClient, m);
    if (fields.length > 0) options.onRecentEdit?.(m.taskId, m.actorId, fields);
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
        case 'tags.changed':
          mark(message.workspaceId, (p) => {
            p.tags = true;
          });
          return;
        case 'feedback.changed':
          mark(message.workspaceId, (p) => {
            p.feedback = true;
            p.sidebar = true;
            // "Linked feedback" in these tasks' drawers.
            for (const id of message.taskIds) p.tasks.add(id);
          });
          return;
        case 'spaces.changed':
          mark(message.workspaceId, (p) => {
            p.sidebar = true;
          });
          // Names and colors in project headers, the archived list and space pages.
          void queryClient.invalidateQueries({ queryKey: ['projects'] });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.archivedProjects(message.workspaceId),
          });
          return;
        case 'sprints.changed':
          refreshAfterSprintChange(queryClient, message.workspaceId);
          return;
        case 'standup.groups.changed':
          void queryClient.invalidateQueries({
            queryKey: queryKeys.standupGroups(message.workspaceId),
          });
          void queryClient.invalidateQueries({ queryKey: ['standup-groups'] });
          return;
        case 'standup.entry_posted':
        case 'standup.entry_updated':
        case 'standup.blocker_changed':
        case 'standup.reaction':
        case 'standup.reply':
          // The group's day (and its posted counts in the sidebar and My Tasks).
          void queryClient.invalidateQueries({ queryKey: queryKeys.standupGroup(message.groupId) });
          void queryClient.invalidateQueries({
            queryKey: queryKeys.standupGroups(message.workspaceId),
          });
          return;
        case 'standup.meeting_changed':
          // Followers move with the facilitator at once; the day page's summary refetches.
          setMeeting(queryClient, message.groupId, message.date, message.meeting, message.at);
          void queryClient.invalidateQueries({ queryKey: queryKeys.standupDays(message.groupId) });
          return;
        case 'tasks.blocked.changed':
          mark(message.workspaceId, (p) => {
            p.allLists = true;
            for (const id of message.taskIds) p.tasks.add(id);
          });
          return;
        case 'absences.changed':
          void refreshAfterAbsences(queryClient, message.workspaceId);
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

/** Drawer fields another person can change under you ("Edited by X just now"). */
export type EditedField = 'title' | 'status' | 'priority' | 'due' | 'assignees';

/** How long "Edited by X just now" stays up. */
export const RECENT_EDIT_MS = 10_000;

/** Someone else changed these drawer fields of a task (each app keeps them for RECENT_EDIT_MS). */
export type RecentEditListener = (
  taskId: string,
  actorId: string,
  fields: readonly EditedField[],
) => void;

const EDITED_BY: Partial<Record<string, EditedField>> = {
  'title.changed': 'title',
  'status.changed': 'status',
  'priority.changed': 'priority',
  'due.changed': 'due',
  'assignee.added': 'assignees',
  'assignee.removed': 'assignees',
};

/** Which drawer fields a message changed ("Edited by X just now", title conflicts). */
function editedFields(queryClient: QueryClient, m: RealtimeTaskMessage): EditedField[] {
  if (m.type === 'task.updated') {
    return [...new Set(m.changes.flatMap((c) => EDITED_BY[c] ?? []))];
  }
  if (m.type === 'task.moved') {
    // A move inside the same status is just a reorder.
    const detail = queryClient
      .getQueriesData<TaskDetail>({ queryKey: queryKeys.taskDetails })
      .find(([, task]) => task?.id === m.taskId)?.[1];
    if (detail && detail.status.id !== m.statusId) return ['status'];
  }
  return [];
}

/** Absences show in member lists, pickers, standup groups and Workload: refetch them all. */
export function refreshAfterAbsences(queryClient: QueryClient, workspaceId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.absencesOf(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.standupGroups(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: ['standup-groups'] }),
    queryClient.invalidateQueries({ queryKey: queryKeys.reportsOf(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: ['projects'] }),
  ]);
}

/**
 * After a sprint changed: the sprint list, the projects' active sprint, the task details and
 * lists that show it, and the reports.
 */
export function refreshAfterSprintChange(queryClient: QueryClient, workspaceId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.sprints(workspaceId) });
  void queryClient.invalidateQueries({ queryKey: ['projects'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskDetails });
  void queryClient.invalidateQueries({ queryKey: queryKeys.taskLists });
  void queryClient.invalidateQueries({ queryKey: queryKeys.reportsOf(workspaceId) });
}

/** Puts a meeting into the cache (keeping my `canDrive`), and refreshes the day page's summary. */
export function setMeeting(
  queryClient: QueryClient,
  groupId: string,
  date: string,
  meeting: StandupMeeting,
  serverNow?: string,
) {
  queryClient.setQueryData<StandupMeetingState>(queryKeys.standupMeeting(groupId, date), (old) =>
    old ? { ...old, meeting, serverNow: serverNow ?? old.serverNow } : undefined,
  );
}
