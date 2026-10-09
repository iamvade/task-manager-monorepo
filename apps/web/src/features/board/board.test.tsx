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
import { at, listHandlers, makeTasks, statusOf } from '../../test/tasks';

type Handler = (init?: RequestInit) => Response;
const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;
const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const BOARD = `/p/${PROJECT_ID}/board?sprint=none`;

function api(tasks: TaskListItem[], extra: Record<string, Handler> = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => tasks),
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

const column = (name: RegExp) => screen.getByRole('region', { name });
const cardOf = (title: string) => {
  const card = screen.getByText(title).closest<HTMLElement>('[data-task-card]');
  if (!card) throw new Error(`No card ${title}`);
  return card;
};

/**
 * jsdom has no layout: give columns (sections) and cards a simple grid so dnd-kit's keyboard
 * sensor and collision detection have rects to work with.
 */
function stubLayout() {
  const rect = (left: number, top: number, width: number, height: number) =>
    DOMRect.fromRect({ x: left, y: top, width, height });
  return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    const sections = [...document.querySelectorAll('section[aria-label]')];
    const section = this.closest('section[aria-label]');
    const col = section ? sections.indexOf(section) : -1;
    if (!section) return rect(0, 0, 0, 0);
    if (this === section) return rect(col * 300, 0, 264, 900);
    const card = this.closest('[data-task-card]');
    if (card && this === card) {
      const cards = [...section.querySelectorAll('[data-task-card]')];
      return rect(col * 300 + 8, 60 + cards.indexOf(card) * 130, 248, 116);
    }
    return rect(0, 0, 0, 0);
  });
}

describe('board', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ collapsedGroups: {}, lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows one tinted column per status with counts and design cards', async () => {
    const tasks = makeTasks();
    // Three tags on the first card: two chips + "+1".
    tasks[0] = {
      ...at(tasks, 0),
      tags: [
        ...at(tasks, 0).tags,
        { id: '01890000-0000-7000-8000-700000000009', name: 'Docs', color: 'neutral' },
      ],
    };
    api(tasks);
    renderAt(BOARD);

    const todo = await screen.findByRole('region', { name: 'To Do, 2 tasks' });
    expect(screen.getByRole('region', { name: 'In Progress, 2 tasks' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'In Review, 2 tasks' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Done, 1 task' })).toBeInTheDocument();
    expect(screen.getByText('7 tasks · 1 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort: Manual' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Columns: Status' })).toBeInTheDocument();

    const audit = within(cardOf('Audit current navigation patterns'));
    expect(audit.getByText('Research')).toBeInTheDocument();
    expect(audit.getByText('UX')).toBeInTheDocument();
    expect(audit.queryByText('Docs')).toBeNull();
    expect(audit.getByText('+1')).toBeInTheDocument();
    expect(audit.getByLabelText('0/4 subtasks done')).toBeInTheDocument();
    expect(audit.getByRole('img', { name: 'Medium priority' })).toBeInTheDocument();
    expect(within(todo).getAllByRole('link')).toHaveLength(2);

    // Overdue in red with the suffix; done = check, muted title, no strike-through.
    expect(
      within(cardOf('Accessibility pass on primary buttons')).getByText('Oct 7 · Overdue'),
    ).toHaveClass('text-due-overdue');
    const done = cardOf('Release notes');
    expect(within(done).getByRole('img', { name: 'Completed' })).toBeInTheDocument();
    expect(within(done).getByText('Release notes')).toHaveClass('text-muted');
    expect(within(done).getByText('Release notes')).not.toHaveClass('line-through');
  });

  it('opens the drawer when a card is clicked', async () => {
    const tasks = makeTasks();
    api(tasks, {
      'GET /api/v1/tasks/APP-131': () => Response.json({ ...at(tasks, 0), description: null }),
    });
    const router = renderAt(BOARD);
    fireEvent.click(await screen.findByText('Audit current navigation patterns'));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-131');
    });
  });

  it('adds a task at the bottom of a column', async () => {
    const tasks = makeTasks();
    const created: unknown[] = [];
    api(tasks, {
      [`POST /api/v1/projects/${PROJECT_ID}/tasks`]: (init) => {
        created.push(body(init));
        return Response.json({}, { status: 500 });
      },
    });
    renderAt(BOARD);
    const review = await screen.findByRole('region', { name: /^In Review/ });
    fireEvent.click(within(review).getByRole('button', { name: 'Add task' }));
    const input = within(review).getByRole('textbox', { name: 'New task title' });
    fireEvent.change(input, { target: { value: 'Polish empty states' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(created).toEqual([
        { title: 'Polish empty states', statusId: statusOf('review').id, position: 'bottom' },
      ]);
    });
  });

  it('moves a card with the keyboard and rolls back with a toast when the move fails', async () => {
    const tasks = makeTasks();
    const moves: unknown[] = [];
    api(tasks, {
      [`POST /api/v1/tasks/${at(tasks, 0).id}/move`]: (init) => {
        moves.push(body(init));
        return Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 });
      },
    });
    renderAt(BOARD);
    await screen.findByRole('region', { name: /^To Do/ });
    stubLayout();

    const card = cardOf('Audit current navigation patterns');
    act(() => {
      card.focus();
    });
    fireEvent.keyDown(card, { key: ' ', code: 'Space' });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'ArrowRight',
      code: 'ArrowRight',
    });
    expect(await screen.findByText('Drop to move to In Progress')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: ' ', code: 'Space' });

    await waitFor(() => {
      expect(moves).toHaveLength(1);
    });
    expect(at(moves, 0)).toMatchObject({ statusId: statusOf('in_progress').id });
    expect(await screen.findByText("Couldn't move the task")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        within(column(/^To Do/)).getByText('Audit current navigation patterns'),
      ).toBeInTheDocument();
    });
  });

  it('applies the shared URL filters', async () => {
    const tasks = makeTasks();
    const fetchMock = api(tasks);
    renderAt(`/p/${PROJECT_ID}/board?sprint=none&priority=urgent`);
    await screen.findByRole('region', { name: /^To Do/ });
    const urls = fetchMock.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls.some((u) => u.includes(`/projects/${PROJECT_ID}/tasks?priority=urgent`))).toBe(
      true,
    );
  });

  it('shows the space board by status category with each card’s project', async () => {
    const tasks = makeTasks();
    api(tasks, {
      [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json(tasks),
    });
    renderAt(`/s/${SPACE_ID}/board`);
    const todo = await screen.findByRole('region', { name: 'To Do, 2 tasks' });
    expect(within(todo).getAllByText('App Redesign')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Add task to/ })).toBeNull();
  });
});
