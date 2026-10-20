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
import { ARCHIVED, ASSIGNED, MENTION, STATUS, page, standupNotification } from '../../test/inbox';
import { at } from '../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const INBOX = page([MENTION, STATUS, ASSIGNED], { unread: 2, archived: 1 });
const ARCHIVED_PAGE = page([ARCHIVED], { unread: 2, archived: 1 });

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function renderInbox(
  extra: Record<string, Handler> = {},
  inbox: () => NotificationPage = () => INBOX,
  entry = '/w/kite-studio/inbox',
) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () =>
      Response.json({ ...SIDEBAR, inboxUnreadCount: inbox().counts.unread }),
    [`GET /api/v1/me/notifications?workspaceId=${WORKSPACE_ID}&tab=all`]: () =>
      Response.json(inbox()),
    [`GET /api/v1/me/notifications?workspaceId=${WORKSPACE_ID}&tab=archived`]: () =>
      Response.json(ARCHIVED_PAGE),
    'GET /api/v1/me/home': () => Response.json(HOME),
    ...extra,
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
const badge = () => screen.queryByLabelText(/^\d+ unread$/);
const calls = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([input]) => (typeof input === 'string' ? input : ''));

describe('Inbox', () => {
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

  it('lists notifications with the actor, the task key, the snippet and unread dots', async () => {
    renderInbox();
    await screen.findByRole('list', { name: 'All' });
    const [mention, status, assigned] = rows();
    expect(mention).toHaveTextContent(
      `Dorj E. mentioned you in ${MENTION.task.key} ${MENTION.task.title}`,
    );
    expect(mention).toHaveTextContent('“Can you take a look before standup?”');
    expect(mention).toHaveTextContent('2h ago · App Redesign');
    expect(status).toHaveTextContent(`moved ${STATUS.task.key} ${STATUS.task.title} to In Review`);
    expect(assigned).toHaveTextContent(`assigned you ${ASSIGNED.task.key}`);
    expect(screen.getAllByRole('img', { name: 'Unread' })).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'All' })).toHaveAttribute('aria-selected', 'true');
    expect(badge()).toHaveAccessibleName('2 unread');
  });

  it('narrows to one project with ?project=, keeping it across tabs', async () => {
    const checkout = SIDEBAR.spaces[0]?.projects[1];
    if (!checkout) throw new Error('fixture');
    const { router } = renderInbox(
      {
        'GET /api/v1/me/notifications': () =>
          Response.json(page([STATUS], { unread: 2, archived: 1 })),
      },
      () => INBOX,
      `/w/kite-studio/inbox?project=${checkout.id}`,
    );
    const filter = await screen.findByRole('button', { name: /Checkout v2/ });
    expect(filter).toBeInTheDocument();
    await waitFor(() => {
      expect(rows()).toHaveLength(1);
    });
    expect(screen.getByRole('tab', { name: 'Mentions' })).toHaveAttribute(
      'href',
      `/w/kite-studio/inbox?tab=mentions&project=${checkout.id}`,
    );
    fireEvent.click(filter);
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'All projects' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('');
    });
  });

  it('opening a row marks it read and opens the task drawer', async () => {
    let inbox = INBOX;
    const { fetchMock, router } = renderInbox(
      {
        [`POST /api/v1/me/notifications/${MENTION.id}/read`]: () => {
          inbox = page([{ ...MENTION, readAt: HOME_NOW.toISOString() }, STATUS, ASSIGNED], {
            unread: 1,
            archived: 1,
          });
          return new Response(null, { status: 204 });
        },
      },
      () => inbox,
    );
    await screen.findByRole('list', { name: 'All' });
    fireEvent.click(at(within(at(rows(), 0)).getAllByRole('button'), 0));
    expect(router.state.location.search).toBe(`?task=${MENTION.task.key}`);
    expect(await screen.findByLabelText('1 unread')).toBeInTheDocument();
    await waitFor(() => {
      expect(calls(fetchMock, 'POST')).toContain(`/api/v1/me/notifications/${MENTION.id}/read`);
    });
  });

  it('archives with an Undo toast', async () => {
    let inbox = INBOX;
    const { fetchMock } = renderInbox(
      {
        [`POST /api/v1/me/notifications/${MENTION.id}/archive`]: () => {
          inbox = page([STATUS, ASSIGNED], { unread: 1, archived: 2 });
          return new Response(null, { status: 204 });
        },
        [`POST /api/v1/me/notifications/${MENTION.id}/unarchive`]: () =>
          new Response(null, { status: 204 }),
      },
      () => inbox,
    );
    await screen.findByRole('list', { name: 'All' });
    fireEvent.click(within(at(rows(), 0)).getByRole('button', { name: 'Archive' }));
    await waitFor(() => {
      expect(rows()).toHaveLength(2);
    });
    expect(badge()).toHaveAccessibleName('1 unread');
    expect(await screen.findByText(`${MENTION.task.key} archived`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(calls(fetchMock, 'POST')).toContain(
        `/api/v1/me/notifications/${MENTION.id}/unarchive`,
      );
    });
  });

  it('marks everything read', async () => {
    let inbox = INBOX;
    const read = { readAt: HOME_NOW.toISOString() };
    const { fetchMock } = renderInbox(
      {
        'POST /api/v1/me/notifications/read-all': () => {
          inbox = page([{ ...MENTION, ...read }, { ...STATUS, ...read }, ASSIGNED], {
            unread: 0,
            archived: 1,
          });
          return Response.json({ updated: 2 });
        },
      },
      () => inbox,
    );
    await screen.findByRole('list', { name: 'All' });
    const button = screen.getByRole('button', { name: 'Mark all as read' });
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryAllByRole('img', { name: 'Unread' })).toHaveLength(0);
    });
    expect(badge()).toBeNull();
    expect(button).toBeDisabled();
    expect(calls(fetchMock, 'POST')).toContain('/api/v1/me/notifications/read-all');
  });

  it('shows the empty state with the archived count', async () => {
    const { router } = renderInbox({}, () => page([], { unread: 0, archived: 24 }));
    expect(
      await screen.findByRole('heading', { name: 'You’re all caught up' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled();
    for (const link of screen.getAllByRole('link', { name: 'Notification settings' })) {
      expect(link).toHaveAttribute('href', '/w/kite-studio/settings?tab=notifications');
    }
    fireEvent.click(screen.getByRole('link', { name: 'View 24 archived notifications' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?tab=archived');
    });
    expect(await screen.findByRole('list', { name: 'Archived' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Move to inbox' })).toBeInTheDocument();
  });
  it('shows standup notifications and opens the group page on that day, or writing', async () => {
    const reply = standupNotification('standup_reply', { snippet: 'Sent the keys' });
    const reminder = standupNotification('standup_reminder', { actor: null });
    const { router } = renderInbox({}, () => page([reply, reminder], { unread: 2, archived: 0 }));
    await screen.findByRole('list', { name: 'All' });
    const [replyRow, reminderRow] = rows();
    expect(replyRow).toHaveTextContent('Dorj E. replied to your standup update in Mobile team');
    expect(replyRow).toHaveTextContent('“Sent the keys”');
    expect(replyRow).toHaveTextContent('· Mobile team');
    expect(reminderRow).toHaveTextContent('Time to post your standup update for Mobile team');
    fireEvent.click(at(within(at(rows(), 0)).getAllByRole('button'), 0));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/w/kite-studio/standup/${reply.standup?.groupId ?? ''}/2026-10-08`,
      );
    });
    await router.navigate('/w/kite-studio/inbox');
    await screen.findByRole('list', { name: 'All' });
    fireEvent.click(at(within(at(rows(), 1)).getAllByRole('button'), 0));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(
        `/w/kite-studio/standup/${reminder.standup?.groupId ?? ''}`,
      );
    });
    expect(router.state.location.search).toBe('?write=1');
  });
});
