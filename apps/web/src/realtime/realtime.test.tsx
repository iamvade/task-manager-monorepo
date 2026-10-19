import type { TaskListItem } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { PILL_DELAY_MS } from '../features/shell/ConnectionPill';
import i18n from '../i18n';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { useRealtimeStore } from '../stores/realtime';
import { useUiStore } from '../stores/ui';
import { FakeWebSocket } from '../test/fakeSocket';
import { ME, PROJECT, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../test/fixtures';
import { at, listHandlers, makeTasks, statusOf } from '../test/tasks';

const LIST = `/p/${PROJECT_ID}/list?sprint=none`;
const ANU = at(PROJECT.members, 0).user;
const SARA = at(PROJECT.members, 1).user;

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

function api(state: { tasks: TaskListItem[] }) {
  const task = at(state.tasks, 4);
  return mockApi({
    'GET /api/v1/auth/me': () =>
      Response.json({ ...ME, preferences: { ...ME.preferences, locale: 'en' } }),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => state.tasks),
    [`GET /api/v1/tasks/${task.key}`]: () =>
      Response.json({
        ...task,
        description: null,
        descriptionText: '',
        sprint: null,
        reviewer: null,
        creator: task.assignees[0] ?? ME.user,
        subtasks: [],
        attachments: [],
        followers: [],
        mentionedIn: [],
        linkedFeedback: [],
        deletedAt: null,
      }),
    [`GET /api/v1/tasks/${task.id}/activity`]: () => Response.json([]),
  });
}

/** The app's socket, once it subscribed to the workspace. */
async function subscribedSocket() {
  await waitFor(() => {
    expect(FakeWebSocket.last?.sent).toContainEqual({
      type: 'subscribe',
      workspaceId: WORKSPACE_ID,
    });
  });
  const socket = FakeWebSocket.last;
  if (!socket) throw new Error('no socket');
  return socket;
}

describe('realtime', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ collapsedGroups: {}, lastWorkspaceId: null });
    useRealtimeStore.getState().reset();
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows who is online in the project header and keeps it current', async () => {
    api({ tasks: makeTasks() });
    renderAt(LIST);
    const socket = await subscribedSocket();
    act(() => {
      socket.receive({
        type: 'ready',
        workspaceId: WORKSPACE_ID,
        online: [ANU.id],
        viewers: {},
      });
    });
    const stack = await screen.findByRole('img', { name: '7 project members' });
    expect(within(stack).getByTitle('Anu Bold · Online')).toBeInTheDocument();
    expect(within(stack).queryByTitle('Sara K. · Online')).not.toBeInTheDocument();

    act(() => {
      socket.receive({ type: 'presence.online', workspaceId: WORKSPACE_ID, userId: SARA.id });
    });
    expect(within(stack).getByTitle('Sara K. · Online')).toBeInTheDocument();
    act(() => {
      socket.receive({ type: 'presence.offline', workspaceId: WORKSPACE_ID, userId: SARA.id });
    });
    expect(within(stack).queryByTitle('Sara K. · Online')).not.toBeInTheDocument();
  });

  it("applies a teammate's move to the list", async () => {
    const state = { tasks: makeTasks() };
    api(state);
    renderAt(LIST);
    const socket = await subscribedSocket();
    const task = at(state.tasks, 0);
    await screen.findByRole('img', { name: '7 project members' });
    await screen.findByText(task.title);
    const done = statusOf('done');
    state.tasks = state.tasks.map((t) =>
      t.id === task.id ? { ...t, status: done, position: 'zz' } : t,
    );
    act(() => {
      socket.receive({
        type: 'task.moved',
        workspaceId: WORKSPACE_ID,
        projectId: PROJECT_ID,
        taskId: task.id,
        actorId: SARA.id,
        at: '2026-10-08T06:00:00.000Z',
        statusId: done.id,
        position: 'zz',
      });
    });
    // Done is collapsed: the card leaves To Do without a refresh.
    await waitFor(() => {
      expect(screen.queryByText(task.title)).not.toBeInTheDocument();
    });
  });

  it('tells the server which task the drawer shows and lists the other viewers', async () => {
    const state = { tasks: makeTasks() };
    api(state);
    const task = at(state.tasks, 4);
    const router = renderAt(`${LIST}&task=${task.key}`);
    const socket = await subscribedSocket();
    act(() => {
      socket.receive({ type: 'ready', workspaceId: WORKSPACE_ID, online: [], viewers: {} });
    });
    await waitFor(() => {
      expect(socket.sent).toContainEqual({ type: 'view', taskId: task.id });
    });
    const dialog = await screen.findByRole('dialog', { name: `Task ${task.key}` });

    act(() => {
      socket.receive({
        type: 'presence.viewers',
        workspaceId: WORKSPACE_ID,
        taskId: task.id,
        userIds: [ME.user.id, SARA.id],
      });
    });
    expect(
      await within(dialog).findByRole('img', { name: 'Also viewing: Sara K.' }),
    ).toBeInTheDocument();

    await act(() => router.navigate(LIST));
    await waitFor(() => {
      expect(socket.sent.at(-1)).toEqual({ type: 'view', taskId: null });
    });
  });

  it('shows "Reconnecting…" only after a drop lasts, then refetches', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = api({ tasks: makeTasks() });
    renderAt(LIST);
    const socket = await subscribedSocket();
    await screen.findByRole('img', { name: '7 project members' });

    FakeWebSocket.autoOpen = false;
    act(() => {
      socket.drop();
    });
    act(() => {
      vi.advanceTimersByTime(PILL_DELAY_MS - 100);
    });
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Reconnecting…' })).toBeInTheDocument(); // sidebar dot

    const before = fetchMock.mock.calls.length;
    const next = FakeWebSocket.last;
    expect(next).not.toBe(socket);
    act(() => {
      next?.open();
    });
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
    });
  });
});
