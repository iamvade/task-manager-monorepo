import type { RealtimeTaskMessage, TaskListItem } from '@kite/shared';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../api/queryKeys';
import { TASK_MUTATION } from '../api/taskCache';
import { PROJECT_ID, SIDEBAR, SPACE_ID, WORKSPACE_ID } from '../test/fixtures';
import { PROJECT_WITH_STATUSES, at, makeTasks, statusOf } from '../test/tasks';
import { RECENT_EDIT_MS, useRealtimeStore } from '../stores/realtime';
import { COALESCE_MS, REPORTS_THROTTLE_MS, createMessageHandler } from './applyMessage';

const OTHER_SPACE = '01890000-0000-7000-8000-000000000011';
const SARA = '01890000-0000-7000-8000-000000000099';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const tasks = makeTasks();
  const projectList = queryKeys.projectTasks(PROJECT_ID, {});
  const spaceList = queryKeys.spaceTasks(SPACE_ID, {});
  const otherSpace = queryKeys.spaceTasks(OTHER_SPACE, {});
  for (const key of [projectList, spaceList, otherSpace]) queryClient.setQueryData(key, tasks);
  queryClient.setQueryData(queryKeys.project(PROJECT_ID), PROJECT_WITH_STATUSES);
  queryClient.setQueryData(queryKeys.sidebar(WORKSPACE_ID), SIDEBAR);
  queryClient.setQueryData(queryKeys.home(WORKSPACE_ID), {});
  queryClient.setQueryData(queryKeys.notificationsOf(WORKSPACE_ID), {});
  const handler = createMessageHandler(queryClient);
  const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
  return { queryClient, tasks, handler, projectList, spaceList, otherSpace, stale };
}

const base = (task: TaskListItem) => ({
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  taskId: task.id,
  actorId: SARA,
  at: '2026-10-08T03:00:00.000Z',
});

describe('createMessageHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves a card at once, then refetches its project's lists and space", () => {
    const s = setup();
    const task = at(s.tasks, 0);
    const done = statusOf('done');
    const message: RealtimeTaskMessage = {
      type: 'task.moved',
      ...base(task),
      statusId: done.id,
      position: 'zz',
    };
    s.handler.handle(message);
    const row = s.queryClient
      .getQueryData<TaskListItem[]>(s.projectList)
      ?.find((t) => t.id === task.id);
    expect(row?.status.id).toBe(done.id);
    expect(row?.position).toBe('zz');
    expect(s.stale(s.projectList)).toBe(false);

    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.stale(s.projectList)).toBe(true);
    expect(s.stale(s.spaceList)).toBe(true);
    expect(s.stale(s.otherSpace)).toBe(false);
    expect(s.stale(queryKeys.project(PROJECT_ID))).toBe(true);
    expect(s.stale(queryKeys.home(WORKSPACE_ID))).toBe(true);
  });

  it('remembers who changed which drawer fields, for 10 seconds', () => {
    const s = setup();
    const task = at(s.tasks, 0);
    useRealtimeStore.setState({ recentEdits: {} });
    s.handler.handle({
      type: 'task.updated',
      ...base(task),
      changes: ['title.changed', 'assignee.added', 'tag.added'],
    });
    expect(useRealtimeStore.getState().recentEdits[task.id]).toEqual({
      title: { actorId: SARA, at: expect.any(Number) as number },
      assignees: { actorId: SARA, at: expect.any(Number) as number },
    });
    vi.advanceTimersByTime(RECENT_EDIT_MS);
    expect(useRealtimeStore.getState().recentEdits[task.id]).toBeUndefined();
  });

  it('removes a deleted task from lists right away', () => {
    const s = setup();
    const task = at(s.tasks, 1);
    s.handler.handle({ type: 'task.deleted', ...base(task) });
    expect(
      s.queryClient.getQueryData<TaskListItem[]>(s.projectList)?.some((t) => t.id === task.id),
    ).toBe(false);
  });

  it('bumps the comment count and refetches only the feed and home', () => {
    const s = setup();
    const task = at(s.tasks, 0);
    s.queryClient.setQueryData(queryKeys.taskActivity(task.id), []);
    s.handler.handle({
      type: 'comment.created',
      ...base(task),
      commentId: '01890000-0000-7000-8000-00000000c001',
    });
    const row = s.queryClient
      .getQueryData<TaskListItem[]>(s.projectList)
      ?.find((t) => t.id === task.id);
    expect(row?.commentCount).toBe(task.commentCount + 1);
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.stale(queryKeys.taskActivity(task.id))).toBe(true);
    expect(s.stale(s.projectList)).toBe(false);
  });

  it('patches the size from task.updated at once, then refetches', () => {
    const s = setup();
    const task = at(s.tasks, 0);
    s.handler.handle({
      type: 'task.updated',
      ...base(task),
      changes: ['size.changed'],
      size: 'L',
    });
    const row = s.queryClient
      .getQueryData<TaskListItem[]>(s.spaceList)
      ?.find((t) => t.id === task.id);
    expect(row?.size).toBe('L');
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.stale(s.projectList)).toBe(true);
  });

  it('leaves task caches alone while a task mutation of mine is in flight', () => {
    const s = setup();
    const task = at(s.tasks, 0);
    vi.spyOn(s.queryClient, 'isMutating').mockImplementation((filters) =>
      filters?.mutationKey === TASK_MUTATION ? 1 : 0,
    );
    s.handler.handle({ type: 'task.deleted', ...base(task) });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.queryClient.getQueryData<TaskListItem[]>(s.projectList)).toHaveLength(s.tasks.length);
    expect(s.stale(s.projectList)).toBe(false);
    // The sidebar count isn't a task cache.
    expect(s.stale(queryKeys.sidebar(WORKSPACE_ID))).toBe(true);
  });

  it('refetches every task list when standup blockers change a "Blocked" marker', () => {
    const s = setup();
    s.handler.handle({
      type: 'tasks.blocked.changed',
      workspaceId: WORKSPACE_ID,
      taskIds: [at(s.tasks, 0).id],
      at: '2026-10-08T03:00:00.000Z',
    });
    vi.advanceTimersByTime(COALESCE_MS);
    for (const key of [s.projectList, s.spaceList, s.otherSpace]) expect(s.stale(key)).toBe(true);
  });

  it('refetches the standup group (and its days) on standup changes', () => {
    const s = setup();
    const group = '01890000-0000-7000-8000-00000000c001';
    const day = queryKeys.standupDay(group, '2026-10-08');
    s.queryClient.setQueryData(day, {});
    s.queryClient.setQueryData(queryKeys.standupGroups(WORKSPACE_ID), []);
    s.handler.handle({
      type: 'standup.reply',
      workspaceId: WORKSPACE_ID,
      groupId: group,
      date: '2026-10-08',
      entryId: '01890000-0000-7000-8000-00000000c002',
      actorId: SARA,
      at: '2026-10-08T03:00:00.000Z',
    });
    expect(s.stale(day)).toBe(true);
    expect(s.stale(queryKeys.standupGroups(WORKSPACE_ID))).toBe(true);
    expect(s.stale(s.projectList)).toBe(false);
  });

  it('refreshes the inbox and badge on a new notification', () => {
    const s = setup();
    s.handler.handle({
      type: 'notification.created',
      workspaceId: WORKSPACE_ID,
      taskId: at(s.tasks, 0).id,
      groupId: null,
      actorId: SARA,
      notificationId: '01890000-0000-7000-8000-00000000a001',
      notificationType: 'mention',
    });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.stale(queryKeys.notificationsOf(WORKSPACE_ID))).toBe(true);
    expect(s.stale(queryKeys.sidebar(WORKSPACE_ID))).toBe(true);
    expect(s.stale(s.projectList)).toBe(false);
  });
});

describe('report refreshes', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refresh reports at once, then at most once per throttle window', () => {
    const s = setup();
    const invalidate = vi.spyOn(s.queryClient, 'invalidateQueries');
    const reportCalls = () =>
      invalidate.mock.calls.filter(
        ([filters]) => filters?.queryKey?.[1] === 'reports' && filters.queryKey[2] === WORKSPACE_ID,
      ).length;
    const message = (): RealtimeTaskMessage => ({
      type: 'task.updated',
      ...base(at(s.tasks, 0)),
      changes: ['priority.changed'],
    });

    s.handler.handle(message());
    expect(reportCalls()).toBe(1);
    s.handler.handle(message());
    s.handler.handle(message());
    vi.advanceTimersByTime(REPORTS_THROTTLE_MS - 1);
    expect(reportCalls()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(reportCalls()).toBe(2);
    // Quiet for a full window: the next change refreshes right away again.
    vi.advanceTimersByTime(REPORTS_THROTTLE_MS);
    expect(reportCalls()).toBe(2);
    s.handler.handle(message());
    expect(reportCalls()).toBe(3);
    s.handler.dispose();
  });
});
