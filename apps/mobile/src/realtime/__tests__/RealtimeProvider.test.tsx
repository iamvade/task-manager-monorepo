import { queryKeys } from '@kite/shared/client';
import { FakeWebSocket, PROJECT_ID, WORKSPACE_ID, at, makeTasks } from '@kite/shared/testing';
import type { TaskListItem } from '@kite/shared';
import { act, renderRouter, waitFor } from 'expo-router/testing-library';
import { queryClient } from '../../api/queryClient';
import { useRealtimeStore } from '../../stores/realtime';
import { LABS_ID, ME_TWO, TOKEN, json, mockApi, resetApp, signedInSession } from '../../test/app';
import { socketUrl } from '../RealtimeProvider';

const SARA = '01890000-0000-7000-8000-000000000102';

async function openApp() {
  await signedInSession();
  mockApi({
    'GET /auth/me': () => json(ME_TWO),
    'GET /me/notifications/unread-counts': () => json([]),
  });
  await renderRouter('src/app', { initialUrl: '/w/kite-studio/my-tasks' });
  // renderRouter runs on fake timers; query results reach React on a timer tick.
  await waitFor(() => {
    jest.advanceTimersByTime(20);
    expect(FakeWebSocket.last?.readyState).toBe(FakeWebSocket.OPEN);
  });
  const ws = FakeWebSocket.last;
  if (!ws) throw new Error('no socket');
  return ws;
}

describe('RealtimeProvider', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('builds the socket URL from the API origin', () => {
    expect(socketUrl('https://tasks.kite.mn')).toMatch(
      /^wss:\/\/tasks\.kite\.mn\/api\/v1\/ws\?client=[A-Za-z0-9-]+$/,
    );
    expect(socketUrl('http://10.0.0.5:3000')).toMatch(/^ws:\/\/10\.0\.0\.5:3000\/api\/v1\/ws/);
  });

  it('opens one socket with the bearer header (never the token in the URL) and subscribes', async () => {
    const ws = await openApp();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(ws.options?.headers).toEqual({ Authorization: `Bearer ${TOKEN}` });
    expect(ws.url).not.toContain(TOKEN);
    await waitFor(() => {
      expect(ws.sent).toContainEqual({ type: 'subscribe', workspaceId: WORKSPACE_ID });
    });
  });

  it('maps events like the web: presence, unread counts, the current workspace only', async () => {
    const ws = await openApp();
    const list = queryKeys.projectTasks(PROJECT_ID, {});
    const tasks = makeTasks();
    const task = at(tasks, 0);
    queryClient.setQueryData(list, tasks);
    queryClient.setQueryData(queryKeys.unreadCounts, []);

    await act(() => {
      ws.receive({ type: 'ready', workspaceId: WORKSPACE_ID, online: [SARA], viewers: {} });
      ws.receive({ type: 'notifications.unread_changed' });
    });
    expect(useRealtimeStore.getState().online.has(SARA)).toBe(true);
    expect(queryClient.getQueryState(queryKeys.unreadCounts)?.isInvalidated).toBe(true);

    const deleted = (workspaceId: string) => ({
      type: 'task.deleted' as const,
      workspaceId,
      projectId: PROJECT_ID,
      taskId: task.id,
      actorId: SARA,
      at: '2026-10-08T03:00:00.000Z',
    });
    await act(() => {
      ws.receive(deleted(LABS_ID));
    });
    expect(queryClient.getQueryData<TaskListItem[]>(list)).toHaveLength(tasks.length);
    await act(() => {
      ws.receive(deleted(WORKSPACE_ID));
    });
    expect(queryClient.getQueryData<TaskListItem[]>(list)?.some((t) => t.id === task.id)).toBe(
      false,
    );
  });
});
