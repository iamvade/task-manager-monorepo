import type { Home } from '@kite/shared';
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
import { HOME, HOME_NOW, OLDER_FEED, OVERDUE, TODAY } from '../../test/home';
import { at, makeTask } from '../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };

type Handler = (init?: RequestInit) => Response | Promise<Response>;

function renderHome(
  extra: Record<string, Handler> = {},
  home: () => Home = () => HOME,
  client = createQueryClient(),
) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    'GET /api/v1/me/home': () => Response.json(home()),
    ...extra,
  });
  const router = createMemoryRouter(routes, { initialEntries: ['/my-tasks'] });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

const card = (name: string) => screen.getByRole('group', { name });
const section = (name: string) => screen.getByRole('region', { name });
const checkbox = (title: string) =>
  screen.getByRole('checkbox', { name: `Mark ${title} complete` });
const completed = TODAY[0].title;
const doneTask = () => Response.json(makeTask(completed, 'done'));

describe('My Tasks', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ collapsedGroups: {}, lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(HOME_NOW);
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens the Done section from the Completed card; project names link to the project', async () => {
    const { router } = renderHome();
    const done = await screen.findByRole('region', { name: 'Done this week' });
    const toggle = within(done).getByRole('button', { name: /^Done this week/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(done).queryByText('Ship onboarding survey')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show Done this week' }));
    expect(await within(done).findByText('Ship onboarding survey')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => {
      expect(toggle).toHaveFocus();
    });
    // Overdue and Due today open their sections too.
    expect(screen.getByRole('button', { name: 'Show Overdue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show Today' })).toBeInTheDocument();

    const row = within(section('Overdue'))
      .getByText(OVERDUE[0].title)
      .closest<HTMLElement>('[role="row"]');
    if (!row) throw new Error('no row');
    fireEvent.click(within(row).getByRole('link', { name: 'App Redesign' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/p\/.+\/list$/);
    });
  });

  it('recovers in place with Try again when the home feed fails', async () => {
    let fail = true;
    const client = createQueryClient();
    client.setDefaultOptions({ queries: { retry: false } });
    renderHome(
      {
        'GET /api/v1/me/home': () =>
          fail
            ? Response.json({ error: { code: 'INTERNAL', message: 'x' } }, { status: 500 })
            : Response.json(HOME),
      },
      () => HOME,
      client,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Good morning, Anu' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('greets by time of day and shows the stat cards', async () => {
    renderHome();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Good morning, Anu' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Thursday, October 8')).toBeInTheDocument();

    expect(card('Due today')).toHaveTextContent('3of 4 left · 1 urgent');
    expect(card('Completed this week')).toHaveTextContent('7+3 vs last week');
    expect(
      within(card('Completed this week')).getByRole('img', {
        name: 'Completed per day: Mon 2, Tue 3, Wed 1, Thu 1',
      }),
    ).toBeInTheDocument();
    expect(card('Overdue')).toHaveTextContent('2oldest is 2 days late');
  });

  it('greets in Mongolian by default', async () => {
    await i18n.changeLanguage('mn');
    mockApi({
      'GET /api/v1/auth/me': () => Response.json(ME),
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
      'GET /api/v1/me/home': () => Response.json(HOME),
    });
    const router = createMemoryRouter(routes, { initialEntries: ['/my-tasks'] });
    render(
      <QueryClientProvider client={createQueryClient()}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Өглөөний мэнд, Anu' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^10-р сарын 8, .+ гараг$/)).toBeInTheDocument();
  });

  it('groups tasks into sections with open counts and hints', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 1 });

    const overdue = within(section('Overdue')).getByRole('button', { name: /^Overdue/ });
    expect(overdue).toHaveTextContent('Overdue2');
    expect(within(section('Overdue')).getByText('Reschedule or close these first')).toBeVisible();
    // Today counts open tasks only (one of four is done).
    expect(within(section('Today')).getByRole('button', { name: /^Today/ })).toHaveTextContent(
      'Today3',
    );
    expect(within(section('Today')).getByText('Thursday, Oct 8')).toBeInTheDocument();
    expect(within(section('This Week')).getByText('Fri, Oct 9 – Sun, Oct 11')).toBeInTheDocument();
    expect(within(section('Later')).getByText('After this week')).toBeInTheDocument();

    const row = checkbox(OVERDUE[0].title).closest('[role="row"]');
    expect(row).toHaveTextContent('App Redesign');
    expect(row).toHaveTextContent('Oct 6');
    expect(row).toHaveTextContent('High');
    expect(within(section('This Week')).getAllByText('Fri, Oct 9')).not.toHaveLength(0);
    expect(
      within(section('Overdue')).getByRole('link', { name: OVERDUE[0].title }),
    ).toHaveAttribute('href', `/my-tasks?task=${OVERDUE[0].key}`);
  });

  it('collapses a section', async () => {
    renderHome();
    await screen.findByRole('heading', { level: 1 });
    const toggle = within(section('Later')).getByRole('button', { name: /^Later/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(section('Later')).queryByRole('row')).toBeNull();
  });

  it('completing a task updates the stat cards before the server answers', async () => {
    let answer: (res: Response) => void = () => undefined;
    const { fetchMock } = renderHome({
      [`POST /api/v1/tasks/${TODAY[0].id}/complete`]: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(checkbox(completed));
    await waitFor(() => {
      expect(card('Due today')).toHaveTextContent('2of 4 left');
    });
    expect(card('Due today')).not.toHaveTextContent('urgent');
    expect(card('Completed this week')).toHaveTextContent('8+4 vs last week');
    expect(checkbox(completed)).toBeChecked();
    expect(within(section('Today')).getByRole('link', { name: completed })).toHaveClass(
      'line-through',
    );
    expect(within(section('Today')).getByRole('button', { name: /^Today/ })).toHaveTextContent(
      'Today2',
    );
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(post?.[1]?.body as string)).toEqual({ done: true });
    answer(doneTask());
  });

  it('keeps a completed row in place after the refetch drops it', async () => {
    let home = HOME;
    renderHome(
      {
        [`POST /api/v1/tasks/${OVERDUE[0].id}/complete`]: () => {
          // The server stops listing done overdue tasks.
          home = {
            ...HOME,
            sections: { ...HOME.sections, overdue: [OVERDUE[1]] },
            stats: { ...HOME.stats, overdue: { count: 1, oldestDaysLate: 1 } },
          };
          return doneTask();
        },
      },
      () => home,
    );
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(checkbox(OVERDUE[0].title));
    await waitFor(() => {
      expect(card('Overdue')).toHaveTextContent('1oldest is 1 day late');
    });
    // After the refetch the row is still there, ticked, above the other one.
    await waitFor(() => {
      expect(home.sections.overdue).toHaveLength(1);
    });
    const rows = within(section('Overdue')).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(at(rows, 0)).getByRole('checkbox')).toBeChecked();
  });

  it('undoes a completion from the toast', async () => {
    const { fetchMock } = renderHome({
      [`POST /api/v1/tasks/${TODAY[0].id}/complete`]: (init) =>
        Response.json(
          makeTask(
            completed,
            (JSON.parse(init?.body as string) as { done: boolean }).done ? 'done' : 'todo',
          ),
        ),
    });
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(checkbox(completed));
    expect(await screen.findByText(`${TODAY[0].key} completed`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(checkbox(completed)).not.toBeChecked();
    });
    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(init?.body as string) as unknown);
    await waitFor(() => {
      expect(bodies).toEqual([{ done: true }, { done: false }]);
    });
  });

  it('rolls back when completing fails', async () => {
    renderHome({
      [`POST /api/v1/tasks/${TODAY[0].id}/complete`]: () =>
        Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    await screen.findByRole('heading', { level: 1 });

    fireEvent.click(checkbox(completed));
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(checkbox(completed)).not.toBeChecked();
    });
    expect(card('Due today')).toHaveTextContent('3of 4 left · 1 urgent');
    expect(card('Completed this week')).toHaveTextContent('7+3 vs last week');
  });

  it('shows recent activity and pages older items', async () => {
    const { fetchMock } = renderHome({
      'GET /api/v1/me/activity': () => Response.json({ items: OLDER_FEED, nextCursor: null }),
    });
    const panel = await screen.findByRole('complementary', { name: 'Recent activity' });

    const items = within(panel).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent(
      `Dorj E. mentioned you in ${OVERDUE[0].title}“Can you take a look before standup?”2h ago · App Redesign`,
    );
    expect(within(at(items, 0)).getByRole('img', { name: 'Unread' })).toBeInTheDocument();
    expect(items[1]).toHaveTextContent(`Bat O. moved ${TODAY[0].title} to In Review`);
    expect(items[1]).toHaveTextContent('Yesterday · App Redesign');
    expect(items[2]).toHaveTextContent('Temuulen G. assigned you');
    expect(within(at(items, 2)).queryByRole('img', { name: 'Unread' })).toBeNull();
    expect(items[3]).toHaveTextContent('to Oct 15');
    expect(within(panel).getByRole('link', { name: 'View inbox' })).toHaveAttribute(
      'href',
      '/inbox',
    );

    fireEvent.click(within(panel).getByRole('button', { name: 'Show older activity' }));
    await waitFor(() => {
      expect(within(panel).getAllByRole('listitem')).toHaveLength(6);
    });
    expect(within(panel).getAllByRole('listitem')[5]).toHaveTextContent(
      `Sara K. completed ${TODAY[2].title}`,
    );
    expect(within(panel).queryByRole('button', { name: 'Show older activity' })).toBeNull();
    const urls = fetchMock.mock.calls.map(([input]) => (typeof input === 'string' ? input : ''));
    expect(urls).toContain(`/api/v1/me/activity?workspaceId=${WORKSPACE_ID}&cursor=cursor-1`);
  });
});
