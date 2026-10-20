import type { Home, StatusCategory, TaskListItem } from '@kite/shared';
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
import { HOME, HOME_NOW, OLDER_FEED, OVERDUE, TODAY, myTask } from '../../test/home';
import { PROJECT, PROJECT_ID } from '../../test/fixtures';
import { PROJECT_WITH_STATUSES, at, makeTask, statusOf } from '../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const DORJ = PROJECT.members.find((m) => m.user.initials === 'DE')?.user;
const DORJ_REF = {
  id: DORJ?.id ?? '',
  name: DORJ?.name ?? '',
  initials: 'DE',
  avatarColor: 'amber' as const,
};

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
    [`GET /api/v1/projects/${PROJECT_ID}`]: () => Response.json(PROJECT_WITH_STATUSES),
    ...extra,
  });
  const router = createMemoryRouter(routes, { initialEntries: ['/w/kite-studio/my-tasks'] });
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
/** The row's status marker; its name ends with the current status. */
const marker = (title: string) =>
  screen.getByRole('button', { name: (name) => name.startsWith(`Status of ${title}: `) });
async function pickStatus(title: string, status: string) {
  fireEvent.click(marker(title));
  const listbox = await screen.findByRole('listbox');
  // The project's statuses load when the picker opens.
  fireEvent.click(await within(listbox).findByRole('option', { name: status }));
}
const detail = (task: TaskListItem) => ({
  ...task,
  description: null,
  descriptionText: '',
  sprint: null,
  reviewer: null,
  creator: ME.user,
  subtasks: [],
  attachments: [],
  followers: [],
  mentionedIn: [],
  linkedFeedback: [],
  deletedAt: null,
});
const patched = (title: string, category: StatusCategory) =>
  Response.json(detail(makeTask(title, category)));
const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;
const completed = TODAY[0].title;
const doneTask = () => patched(completed, 'done');

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
      expect(router.state.location.pathname).toMatch(/^\/w\/kite-studio\/p\/.+\/list$/);
    });
  });

  it('lists tasks I requested from others, collapsed, with who has them', async () => {
    const requested = {
      ...myTask('Ask design for icons', '2026-10-20', 'medium'),
      assignees: [DORJ_REF],
    };
    renderHome({}, () => ({ ...HOME, sections: { ...HOME.sections, requested: [requested] } }));
    const section = await screen.findByRole('region', { name: 'Requested by me' });
    const toggle = within(section).getByRole('button', { name: /^Requested by me/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const row = within(section)
      .getByText('Ask design for icons')
      .closest<HTMLElement>('[role="row"]');
    if (!row) throw new Error('no row');
    expect(within(row).getByTitle('Dorj E.')).toBeInTheDocument();
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
    const router = createMemoryRouter(routes, { initialEntries: ['/w/kite-studio/my-tasks'] });
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

    const row = marker(OVERDUE[0].title).closest('[role="row"]');
    expect(row).toHaveTextContent('App Redesign');
    expect(row).toHaveTextContent('Oct 6');
    expect(row).toHaveTextContent('High');
    expect(within(section('This Week')).getAllByText('Fri, Oct 9')).not.toHaveLength(0);
    expect(
      within(section('Overdue')).getByRole('link', { name: OVERDUE[0].title }),
    ).toHaveAttribute('href', `/w/kite-studio/my-tasks?task=${OVERDUE[0].key}`);
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
      [`PATCH /api/v1/tasks/${TODAY[0].id}`]: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    await screen.findByRole('heading', { level: 1 });

    await pickStatus(completed, 'Done');
    await waitFor(() => {
      expect(card('Due today')).toHaveTextContent('2of 4 left');
    });
    expect(card('Due today')).not.toHaveTextContent('urgent');
    expect(card('Completed this week')).toHaveTextContent('8+4 vs last week');
    expect(marker(completed)).toHaveAccessibleName(`Status of ${completed}: Done`);
    expect(within(section('Today')).getByRole('link', { name: completed })).toHaveClass(
      'line-through',
    );
    expect(within(section('Today')).getByRole('button', { name: /^Today/ })).toHaveTextContent(
      'Today2',
    );
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(body(patch?.[1])).toEqual({ statusId: statusOf('done').id });
    answer(doneTask());
  });

  it('keeps a completed row in place after the refetch drops it', async () => {
    let home = HOME;
    renderHome(
      {
        [`PATCH /api/v1/tasks/${OVERDUE[0].id}`]: () => {
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

    await pickStatus(OVERDUE[0].title, 'Done');
    await waitFor(() => {
      expect(card('Overdue')).toHaveTextContent('1oldest is 1 day late');
    });
    // After the refetch the row is still there, ticked, above the other one.
    await waitFor(() => {
      expect(home.sections.overdue).toHaveLength(1);
    });
    const rows = within(section('Overdue')).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(within(at(rows, 0)).getByRole('button', { name: /^Status of / })).toHaveAccessibleName(
      `Status of ${OVERDUE[0].title}: Done`,
    );
  });

  it('undoes a completion from the toast', async () => {
    const { fetchMock } = renderHome({
      [`PATCH /api/v1/tasks/${TODAY[0].id}`]: (init) =>
        patched(
          completed,
          (body(init) as { statusId: string }).statusId === statusOf('done').id ? 'done' : 'todo',
        ),
    });
    await screen.findByRole('heading', { level: 1 });

    await pickStatus(completed, 'Done');
    expect(await screen.findByText(`${TODAY[0].key} completed`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(marker(completed)).toHaveAccessibleName(`Status of ${completed}: To Do`);
    });
    const bodies = () =>
      fetchMock.mock.calls
        .filter(([, init]) => init?.method === 'PATCH')
        .map(([, init]) => body(init));
    await waitFor(() => {
      expect(bodies()).toEqual([
        { statusId: statusOf('done').id },
        { statusId: statusOf('todo').id },
      ]);
    });
  });

  it('changes a status without completing: no toast, stat cards stay', async () => {
    let home = HOME;
    const { fetchMock } = renderHome(
      {
        [`PATCH /api/v1/tasks/${TODAY[0].id}`]: () => {
          const s = statusOf('in_progress');
          const status = { id: s.id, name: null, category: s.category, color: null };
          home = {
            ...HOME,
            sections: {
              ...HOME.sections,
              today: HOME.sections.today.map((t) => (t.id === TODAY[0].id ? { ...t, status } : t)),
            },
          };
          return patched(completed, 'in_progress');
        },
      },
      () => home,
    );
    await screen.findByRole('heading', { level: 1 });

    await pickStatus(completed, 'In Progress');
    await waitFor(() => {
      expect(marker(completed)).toHaveAccessibleName(`Status of ${completed}: In Progress`);
    });
    expect(within(section('Today')).getByRole('link', { name: completed })).not.toHaveClass(
      'line-through',
    );
    expect(card('Due today')).toHaveTextContent('3of 4 left · 1 urgent');
    expect(screen.queryByText(`${TODAY[0].key} completed`)).toBeNull();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(body(patch?.[1])).toEqual({ statusId: statusOf('in_progress').id });
  });

  it('rolls back when completing fails', async () => {
    renderHome({
      [`PATCH /api/v1/tasks/${TODAY[0].id}`]: () =>
        Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    await screen.findByRole('heading', { level: 1 });

    await pickStatus(completed, 'Done');
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeInTheDocument();
    await waitFor(() => {
      expect(marker(completed)).toHaveAccessibleName(`Status of ${completed}: To Do`);
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
      '/w/kite-studio/inbox',
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
