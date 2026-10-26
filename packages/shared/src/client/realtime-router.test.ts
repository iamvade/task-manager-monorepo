import { QueryClient } from '@tanstack/query-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from './query-keys.js';
import { COALESCE_MS } from './realtime-cache.js';
import { createRealtimeRouter } from './realtime-router.js';
import { PROJECT_ID, WORKSPACE_ID } from './testing/fixtures.js';
import { at, makeTasks } from './testing/tasks.js';

const OTHER_WS = '01890000-0000-7000-8000-000000000003';
const SARA = '01890000-0000-7000-8000-000000000099';
const TASK = '01890000-0000-7000-8000-000000000601';

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  const list = queryKeys.projectTasks(PROJECT_ID, {});
  queryClient.setQueryData(list, makeTasks());
  queryClient.setQueryData(queryKeys.unreadCounts, []);
  const presence = { ready: vi.fn(), setOnline: vi.fn(), setViewers: vi.fn() };
  const router = createRealtimeRouter({
    queryClient,
    currentWorkspaceId: () => WORKSPACE_ID,
    presence,
  });
  const stale = (key: readonly unknown[]) => queryClient.getQueryState(key)?.isInvalidated;
  return { queryClient, router, presence, list, stale };
}

describe('createRealtimeRouter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes the unread counts for any workspace', () => {
    const s = setup();
    s.router.handle({ type: 'notifications.unread_changed' });
    expect(s.stale(queryKeys.unreadCounts)).toBe(true);
  });

  it('sends presence of the current workspace to the sink', () => {
    const s = setup();
    s.router.handle({ type: 'ready', workspaceId: WORKSPACE_ID, online: [SARA], viewers: {} });
    s.router.handle({ type: 'presence.offline', workspaceId: WORKSPACE_ID, userId: SARA });
    s.router.handle({
      type: 'presence.viewers',
      workspaceId: WORKSPACE_ID,
      taskId: TASK,
      userIds: [SARA],
    });
    expect(s.presence.ready).toHaveBeenCalledWith(WORKSPACE_ID, [SARA], {});
    expect(s.presence.setOnline).toHaveBeenCalledWith(SARA, false);
    expect(s.presence.setViewers).toHaveBeenCalledWith(TASK, [SARA]);
  });

  it('drops messages of another workspace', () => {
    const s = setup();
    const task = at(makeTasks(), 0);
    s.router.handle({ type: 'presence.online', workspaceId: OTHER_WS, userId: SARA });
    s.router.handle({
      type: 'task.deleted',
      workspaceId: OTHER_WS,
      projectId: PROJECT_ID,
      taskId: task.id,
      actorId: SARA,
      at: '2026-10-08T03:00:00.000Z',
    });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.presence.setOnline).not.toHaveBeenCalled();
    expect(s.stale(s.list)).toBe(false);
  });

  it("hands the current workspace's changes to the cache mapping", () => {
    const s = setup();
    const task = at(makeTasks(), 0);
    s.router.handle({
      type: 'task.updated',
      workspaceId: WORKSPACE_ID,
      projectId: PROJECT_ID,
      taskId: task.id,
      actorId: SARA,
      at: '2026-10-08T03:00:00.000Z',
      changes: ['priority.changed'],
    });
    vi.advanceTimersByTime(COALESCE_MS);
    expect(s.stale(s.list)).toBe(true);
    s.router.dispose();
  });
});
