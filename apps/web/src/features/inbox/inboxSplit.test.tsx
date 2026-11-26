import type { NotificationPage } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { HOME, HOME_NOW } from '../../test/home';
import { ASSIGNED, MENTION, STATUS, page, standupNotification } from '../../test/inbox';
import { at } from '../../test/tasks';

// jsdom has no layout: pretend the page is wide enough for the side pane.
vi.mock('./useInboxSplit', () => ({ INBOX_LIST_WIDTH: 440, useInboxSplit: () => true }));

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const REPLY = standupNotification('standup_reply', { snippet: 'Sent the keys' });
const ACTOR = MENTION.actor ?? ME.user;
const REMINDER = standupNotification('standup_reminder', { actor: null });
const DIGEST = standupNotification('standup_digest', {
  actor: null,
  digest: { posted: [ACTOR], notPosted: [ME.user], out: [], openBlockers: 2 },
});
const INBOX = page([MENTION, STATUS, ASSIGNED, REPLY], { unread: 3, archived: 0 });
const NO_CONTENT = () => new Response(null, { status: 204 });
const NOT_FOUND = () =>
  Response.json({ error: { code: 'NOT_FOUND', message: 'nope' } }, { status: 404 });

function renderInbox(entry = '/w/kite-studio/inbox', inbox: () => NotificationPage = () => INBOX) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () =>
      Response.json({ ...SIDEBAR, inboxUnreadCount: inbox().counts.unread }),
    [`GET /api/v1/me/notifications?workspaceId=${WORKSPACE_ID}&tab=all`]: () =>
      Response.json(inbox()),
    'GET /api/v1/me/home': () => Response.json(HOME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/standup-groups`]: () => Response.json([]),
    // The pane's task detail: a 404 still shows the key in its header.
    [`GET /api/v1/tasks/${MENTION.task.key}`]: NOT_FOUND,
    [`GET /api/v1/tasks/${STATUS.task.key}`]: NOT_FOUND,
    [`GET /api/v1/tasks/${ASSIGNED.task.key}`]: NOT_FOUND,
    [`POST /api/v1/me/notifications/${MENTION.id}/read`]: NO_CONTENT,
    [`POST /api/v1/me/notifications/${STATUS.id}/read`]: NO_CONTENT,
    [`POST /api/v1/me/notifications/${REPLY.id}/read`]: NO_CONTENT,
    [`POST /api/v1/me/notifications/${MENTION.id}/unread`]: NO_CONTENT,
    [`POST /api/v1/me/notifications/${MENTION.id}/archive`]: NO_CONTENT,
  });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

const rows = () => within(screen.getByRole('list', { name: 'All' })).getAllByRole('listitem');
const pane = () => screen.getByRole('region', { name: 'Notification detail' });
const posts = (fetchMock: ReturnType<typeof mockApi>) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === 'POST')
    .map(([input]) => (typeof input === 'string' ? input : ''));
const press = (key: string) => {
  fireEvent.keyDown(document.body, { key });
};

describe('Inbox side view', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOME_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a placeholder until a row is picked, then the task in the pane (no drawer)', async () => {
    const { fetchMock, router } = renderInbox();
    await screen.findByRole('list', { name: 'All' });
    expect(within(pane()).getByText('No notification selected')).toBeInTheDocument();
    fireEvent.click(at(within(at(rows(), 0)).getAllByRole('button'), 0));
    expect(router.state.location.search).toBe(`?n=${MENTION.id}`);
    expect(await within(pane()).findByText(MENTION.task.key)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(at(within(at(rows(), 0)).getAllByRole('button'), 0)).toHaveAttribute(
      'aria-current',
      'true',
    );
    await waitFor(() => {
      expect(posts(fetchMock)).toContain(`/api/v1/me/notifications/${MENTION.id}/read`);
    });
  });

  it('previews a standup notification with a link to the group page', async () => {
    renderInbox(`/w/kite-studio/inbox?n=${REPLY.id}`);
    await screen.findByRole('list', { name: 'All' });
    expect(
      await within(pane()).findByText(/replied to your standup update in Mobile team/),
    ).toBeInTheDocument();
    expect(within(pane()).getByText('Sent the keys')).toBeInTheDocument();
    expect(within(pane()).getByText('Reply')).toBeInTheDocument();
    expect(within(pane()).getByRole('link', { name: 'Open standup' })).toHaveAttribute(
      'href',
      `/w/kite-studio/standup/${REPLY.standup?.groupId ?? ''}/2026-10-08`,
    );
  });

  it('previews a reminder (Write update) and a digest (who posted, open blockers)', async () => {
    const inbox = page([REMINDER, DIGEST], { unread: 2, archived: 0 });
    const { router } = renderInbox(`/w/kite-studio/inbox?n=${REMINDER.id}`, () => inbox);
    await screen.findByRole('list', { name: 'All' });
    expect(await within(pane()).findByRole('link', { name: 'Write update' })).toHaveAttribute(
      'href',
      `/w/kite-studio/standup/${REMINDER.standup?.groupId ?? ''}?write=1`,
    );
    await router.navigate(`/w/kite-studio/inbox?n=${DIGEST.id}`);
    expect(await within(pane()).findByText('Posted · 1')).toBeInTheDocument();
    expect(within(pane()).getByText('Not yet · 1')).toBeInTheDocument();
    expect(within(pane()).getByText('2 open blockers')).toBeInTheDocument();
    expect(within(pane()).getByRole('link', { name: 'Open standup' })).toBeInTheDocument();
  });

  it('moves with J/K and arrows, marks unread with U and archives with E', async () => {
    const read = { ...MENTION, readAt: HOME_NOW.toISOString() };
    const { fetchMock, router } = renderInbox('/w/kite-studio/inbox', () =>
      page([read, STATUS, ASSIGNED, REPLY], { unread: 2, archived: 0 }),
    );
    await screen.findByRole('list', { name: 'All' });
    press('j');
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?n=${MENTION.id}`);
    });
    press('ArrowDown');
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?n=${STATUS.id}`);
    });
    press('k');
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?n=${MENTION.id}`);
    });
    press('u');
    await waitFor(() => {
      expect(posts(fetchMock)).toContain(`/api/v1/me/notifications/${MENTION.id}/unread`);
    });
    press('e');
    await waitFor(() => {
      expect(posts(fetchMock)).toContain(`/api/v1/me/notifications/${MENTION.id}/archive`);
    });
    // The next row takes the archived one's place in the pane.
    expect(router.state.location.search).toBe(`?n=${STATUS.id}`);
  });

  it('ignores the keys while typing', async () => {
    const { router } = renderInbox();
    await screen.findByRole('list', { name: 'All' });
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'j' });
    expect(router.state.location.search).toBe('');
    input.remove();
  });
});
