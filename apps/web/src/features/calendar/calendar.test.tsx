import type { TaskListItem } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, SIDEBAR, SPACE_ID, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at, listHandlers, makeTask, makeTasks } from '../../test/tasks';

type Handler = (init?: RequestInit) => Response | Promise<Response>;
const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;
const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const SPACE_CALENDAR = `/w/kite-studio/s/${SPACE_ID}/calendar`;
const CHECKOUT = {
  id: '01890000-0000-7000-8000-000000000021',
  spaceId: SPACE_ID,
  key: 'CHE',
  name: 'Checkout v2',
  color: 'sky',
} as const;

/** makeTasks() (dues Oct 5–16, one done) + two unscheduled tasks, one in Checkout v2. */
function calendarTasks(): TaskListItem[] {
  const tasks = makeTasks();
  return [
    ...tasks,
    makeTask('Skeleton loaders for product grid', 'todo', { priority: 'medium' }),
    { ...makeTask('Apple Pay button placement', 'todo', { priority: 'high' }), project: CHECKOUT },
  ];
}

/**
 * Both calendar queries (range and unscheduled) answer with every task: the calendar places
 * rows by their own due date, so the split doesn't matter here. `state.tasks` is what the
 * server holds (refetches after a mutation read it).
 */
function api(state: { tasks: TaskListItem[] }, extra: Record<string, Handler> = {}, me = EN_ME) {
  return mockApi({
    'GET /api/v1/auth/me': () => Response.json(me),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => state.tasks),
    [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json(state.tasks),
    ...extra,
  });
}

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

const day = (name: RegExp) => screen.getByRole('group', { name });
const panel = () => screen.getByRole('complementary', { name: /Unscheduled/ });
const findPanel = () => screen.findByRole('complementary', { name: /Unscheduled/ });

/**
 * jsdom has no layout: day cells tile a 7-column grid (100×128), the Unscheduled panel sits to
 * the right, and pills/cards get small rects inside their container, so dnd-kit's keyboard
 * sensor and the containment collision have rects to work with.
 */
function stubLayout() {
  const rect = (left: number, top: number, width: number, height: number) =>
    DOMRect.fromRect({ x: left, y: top, width, height });
  const cellRect = (cell: Element) => {
    const i = [...document.querySelectorAll('[data-date]')].indexOf(cell);
    return rect((i % 7) * 100, Math.floor(i / 7) * 130, 100, 128);
  };
  const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ): DOMRect {
    const cell = this.closest('[data-date]');
    if (cell) {
      const r = cellRect(cell);
      return this === cell ? r : rect(r.left + 4, r.top + 30, 90, 22);
    }
    const aside = this.closest('aside');
    if (aside) {
      if (this === aside) return rect(800, 0, 280, 900);
      const card = this.closest('[data-task-card]');
      const cards = [...aside.querySelectorAll('[data-task-card]')];
      return card ? rect(810, 120 + cards.indexOf(card) * 70, 260, 60) : rect(0, 0, 0, 0);
    }
    // The drag overlay starts where the picked-up (focused) item is.
    const source = document.activeElement;
    if (source && source !== this && source.closest('[data-date], aside')) {
      return source.getBoundingClientRect();
    }
    return rect(0, 0, 0, 0);
  });
  return spy;
}

async function pickUp(el: HTMLElement) {
  act(() => {
    el.focus();
  });
  fireEvent.keyDown(el, { key: ' ', code: 'Space' });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const press = (code: string) => {
  fireEvent.keyDown(document.activeElement ?? document.body, {
    key: code === 'Space' ? ' ' : code,
    code,
  });
};

describe('calendar', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({
      lastWorkspaceId: null,
      createOpen: false,
      paletteOpen: false,
      shortcutsOpen: false,
      calendarMode: 'month',
      calendarHidden: {},
    });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows the month with tasks on their days and the unscheduled panel', async () => {
    api({ tasks: calendarTasks() });
    renderAt(SPACE_CALENDAR);

    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /, \d+ tasks?$/ })).toHaveLength(35);
    const thu = await screen.findByRole('group', { name: 'Thursday, Oct 8, 1 task' });
    expect(within(thu).getByText('8')).toHaveClass('bg-accent');
    expect(within(thu).getByText('Checkout page — responsive layout')).toBeInTheDocument();
    expect(within(day(/^Thursday, Oct 1,/)).getByText('Oct 1')).toBeInTheDocument();
    // Done: struck through.
    expect(within(day(/^Monday, Oct 5,/)).getByText('Release notes')).toHaveClass('line-through');

    const uns = within(panel());
    expect(uns.getByText('2')).toBeInTheDocument();
    expect(uns.getByText('Skeleton loaders for product grid')).toBeInTheDocument();
    expect(uns.getByText('Apple Pay button placement')).toBeInTheDocument();
    // Calendar toolbar: no Sort / Group.
    expect(screen.queryByRole('button', { name: /^Sort/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Group/ })).toBeNull();
  });

  it('uses Mongolian weekday names and titles', async () => {
    api({ tasks: calendarTasks() }, {}, ME);
    await i18n.changeLanguage('mn');
    renderAt(SPACE_CALENDAR);
    expect(await screen.findByRole('heading', { name: '2026 оны 10-р сар' })).toBeInTheDocument();
    for (const name of ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getByText('10-р сарын 1')).toBeInTheDocument();
  });

  it('shows 2 pills + "+N more" on a busy day and lists them all in a popover', async () => {
    const extra = ['A', 'B', 'C'].map((t) => makeTask(`Busy ${t}`, 'todo', { due: '2026-10-14' }));
    api({ tasks: [...calendarTasks(), ...extra] });
    renderAt(SPACE_CALENDAR);
    const cell = await screen.findByRole('group', { name: 'Wednesday, Oct 14, 4 tasks' });
    expect(within(cell).getAllByRole('link')).toHaveLength(2);
    fireEvent.click(within(cell).getByRole('button', { name: '+2 more' }));
    const popover = await screen.findByRole('dialog', { name: 'Wednesday, Oct 14, 4 tasks' });
    expect(within(popover).getByText('Wednesday, Oct 14')).toBeInTheDocument();
    expect(within(popover).getAllByRole('link')).toHaveLength(4);
    fireEvent.click(within(popover).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('switches to the week and pages through periods', async () => {
    api({ tasks: calendarTasks() });
    renderAt(SPACE_CALENDAR);
    await screen.findByRole('heading', { name: 'October 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Week' }));
    expect(screen.getByRole('heading', { name: 'Oct 5 – 11, 2026' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: /, \d+ tasks?$/ })).toHaveLength(7);
    expect(useUiStore.getState().calendarMode).toBe('week');
    fireEvent.click(screen.getByRole('button', { name: 'Previous week' }));
    expect(screen.getByRole('heading', { name: 'Sep 28 – Oct 4, 2026' })).toBeInTheDocument();
  });

  it('hides a project everywhere when its chip is toggled off', async () => {
    const tasks = calendarTasks();
    tasks.push({ ...makeTask('Promo code QA', 'todo', { due: '2026-10-09' }), project: CHECKOUT });
    api({ tasks });
    renderAt(SPACE_CALENDAR);
    await screen.findByText('Promo code QA');
    const chips = screen.getByRole('group', { name: 'Show projects' });
    const chip = within(chips).getByRole('button', { name: 'Checkout v2' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Promo code QA')).toBeNull();
    expect(within(panel()).queryByText('Apple Pay button placement')).toBeNull();
    expect(useUiStore.getState().calendarHidden[SPACE_ID]).toEqual([CHECKOUT.id]);
  });

  it('filters the unscheduled tasks and shows the empty state', async () => {
    api({ tasks: makeTasks() });
    renderAt(SPACE_CALENDAR);
    expect(
      await within(await findPanel()).findByText('Everything is scheduled.'),
    ).toBeInTheDocument();
  });

  it('filters by title in the unscheduled panel', async () => {
    api({ tasks: calendarTasks() });
    renderAt(SPACE_CALENDAR);
    const input = await within(await findPanel()).findByRole('searchbox', {
      name: 'Filter unscheduled tasks',
    });
    fireEvent.change(input, { target: { value: 'apple' } });
    expect(within(panel()).queryByText('Skeleton loaders for product grid')).toBeNull();
    expect(within(panel()).getByText('Apple Pay button placement')).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Add unscheduled task' }));
    expect(useUiStore.getState()).toMatchObject({ createOpen: true, createDefaults: {} });
  });

  it('schedules an unscheduled task with the keyboard, optimistically', async () => {
    const state = { tasks: calendarTasks() };
    const task = at(state.tasks, 7);
    const patches: unknown[] = [];
    let answer: (r: Response) => void = () => undefined;
    api(state, {
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        patches.push(body(init));
        return new Promise<Response>((resolve) => {
          answer = resolve;
        });
      },
    });
    renderAt(SPACE_CALENDAR);
    const card = await within(await findPanel()).findByRole('link', {
      name: 'Skeleton loaders for product grid, App Redesign, Medium priority. Draggable.',
    });
    stubLayout();
    await pickUp(card);
    // ← from Unscheduled lands on today, → one day later.
    press('ArrowLeft');
    press('ArrowRight');
    expect(
      await within(day(/^Friday, Oct 9,/)).findByText('Skeleton loaders for product grid'),
    ).toBeInTheDocument();
    expect(day(/^Friday, Oct 9,/)).toHaveClass('bg-accent-soft');
    press('Space');

    await waitFor(() => {
      expect(patches).toEqual([{ dueDate: '2026-10-09' }]);
    });
    // Optimistic: on the day before the server answers.
    expect(
      within(day(/^Friday, Oct 9,/)).getByText('Skeleton loaders for product grid'),
    ).toBeInTheDocument();
    expect(within(panel()).queryByText('Skeleton loaders for product grid')).toBeNull();
    state.tasks = state.tasks.map((x) => (x.id === task.id ? { ...x, dueDate: '2026-10-09' } : x));
    answer(Response.json({ ...task, dueDate: '2026-10-09', description: null }));
  });

  it('clears the date when a pill is dropped on Unscheduled, and rolls back on failure', async () => {
    const state = { tasks: calendarTasks() };
    const task = at(state.tasks, 2); // Implement new bottom tab bar, due Sat Oct 10
    const patches: unknown[] = [];
    api(state, {
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        patches.push(body(init));
        return Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 });
      },
    });
    renderAt(SPACE_CALENDAR);
    await screen.findByText(task.title);
    const saturday = day(/^Saturday, Oct 10,/);
    const pill = within(saturday).getByRole('link', { name: 'Implement new bottom tab bar' });
    stubLayout();
    await pickUp(pill);
    press('ArrowRight'); // Sunday
    press('ArrowRight'); // → Unscheduled
    await waitFor(() => {
      expect(panel()).toHaveClass('bg-accent-soft');
    });
    press('Space');

    await waitFor(() => {
      expect(patches).toEqual([{ dueDate: null }]);
    });
    expect(await screen.findByText("Couldn't reschedule the task")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(day(/^Saturday, Oct 10,/)).getByText(task.title)).toBeInTheDocument();
    });
    expect(within(panel()).queryByText(task.title)).toBeNull();
  });

  it('opens the drawer from a pill', async () => {
    const tasks = calendarTasks();
    api(
      { tasks },
      {
        'GET /api/v1/tasks/APP-131': () => Response.json({ ...at(tasks, 0), description: null }),
      },
    );
    const router = renderAt(SPACE_CALENDAR);
    fireEvent.click(await screen.findByText('Audit current navigation patterns'));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-131');
    });
  });

  it('shows the project calendar without applying the active sprint filter', async () => {
    const fetchMock = api({ tasks: calendarTasks() });
    const router = renderAt(`/w/kite-studio/p/${PROJECT_ID}/calendar`);
    await screen.findByRole('heading', { name: 'October 2026' });
    expect(await screen.findByText('Audit current navigation patterns')).toBeInTheDocument();
    expect(router.state.location.search).toBe('');
    expect(screen.queryByRole('group', { name: 'Show projects' })).toBeNull();
    const urls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls).toContain(
      `/api/v1/projects/${PROJECT_ID}/tasks?dueFrom=2026-09-28&dueTo=2026-11-01`,
    );
    expect(urls).toContain(
      `/api/v1/projects/${PROJECT_ID}/tasks?hasDueDate=false&includeDone=false`,
    );
  });
});
