import type { ProjectDetail, TaskListItem } from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, SIDEBAR, SPACE_ID, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { PROJECT_WITH_STATUSES, at, listHandlers, makeTasks, statusOf } from '../../test/tasks';

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

type Handler = (init?: RequestInit) => Response;

/** A tiny stateful API: mutations change `state`, so refetches after them agree. */
function api(extra: (state: State) => Record<string, Handler> = () => ({}), state = newState()) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => state.tasks),
    [`GET /api/v1/projects/${PROJECT_ID}`]: () => Response.json(state.project),
    ...extra(state),
  });
  return { fetchMock, state };
}

interface State {
  tasks: TaskListItem[];
  project: ProjectDetail;
}
const newState = (tasks = makeTasks(), project = PROJECT_WITH_STATUSES): State => ({
  tasks,
  project,
});
const detail = (task: TaskListItem) => ({
  ...task,
  description: null,
  descriptionText: '',
  sprint: null,
  creator: task.assignees[0] ?? ME.user,
  subtasks: [],
  attachments: [],
  followers: [],
  deletedAt: null,
});

const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;
const group = (name: string) => screen.getByRole('rowgroup', { name });
const toggleOf = (name: string) =>
  within(group(name)).getByRole('button', { name: new RegExp(`^${name}`) });
function rowOf(title: string): HTMLElement {
  const row = screen.getByText(title).closest<HTMLElement>('[role="row"]');
  if (!row) throw new Error(`No row for ${title}`);
  return row;
}
const focused = () => document.activeElement ?? document.body;
const href = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const LIST = `/p/${PROJECT_ID}/list?sprint=none`;

describe('project list', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({
      collapsedGroups: {},
      lastWorkspaceId: null,
      createOpen: false,
      paletteOpen: false,
      shortcutsOpen: false,
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('mn');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('groups by status with Done collapsed, and remembers collapsed groups', async () => {
    api();
    renderAt(LIST);

    expect(await screen.findByRole('table', { name: 'App Redesign төслийн ажлууд' })).toBeVisible();
    const todo = group('Хийх');
    expect(toggleOf('Хийх')).toHaveAttribute('aria-expanded', 'true');
    expect(within(todo).getByText('Audit current navigation patterns')).toBeInTheDocument();
    expect(within(todo).getByText('0/4')).toBeInTheDocument();
    expect(within(todo).getByText('Temuulen G.')).toBeInTheDocument();
    // Two assignees: first short name + "+1".
    expect(within(group('Хийгдэж буй')).getByText('Dorj E. +1')).toBeInTheDocument();
    expect(screen.getByText('7 ажил · 1 дууссан')).toBeInTheDocument();

    const done = toggleOf('Дууссан');
    expect(done).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Release notes')).not.toBeInTheDocument();
    fireEvent.click(done);
    expect(screen.getByText('Release notes')).toBeInTheDocument();
    fireEvent.click(toggleOf('Хийх'));
    expect(screen.queryByText('Audit current navigation patterns')).not.toBeInTheDocument();

    const stored = JSON.parse(localStorage.getItem('kite.ui') ?? '{}') as {
      state: { collapsedGroups: Record<string, Record<string, boolean>> };
    };
    expect(stored.state.collapsedGroups[`p:${PROJECT_ID}`]).toEqual({
      [`status:${statusOf('done').id}`]: false,
      [`status:${statusOf('todo').id}`]: true,
    });
  });

  it('completes a task optimistically and rolls back on error', async () => {
    let fail = false;
    const { fetchMock, state } = api((st) => {
      const audit = at(st.tasks, 0);
      return {
        [`POST /api/v1/tasks/${audit.id}/complete`]: () => {
          if (fail)
            return Response.json({ error: { code: 'BOOM', message: 'x' } }, { status: 500 });
          const done = statusOf('done');
          const next = {
            ...audit,
            status: { ...audit.status, id: done.id, category: 'done' as const },
            position: 'z0',
            completedAt: '2026-10-08T03:00:00.000Z',
          };
          st.tasks = st.tasks.map((t) => (t.id === audit.id ? next : t));
          return Response.json(next);
        },
      };
    });
    const title = at(state.tasks, 0).title;
    renderAt(LIST);

    fireEvent.click(
      await screen.findByRole('checkbox', { name: `«${title}» ажлыг дууссан гэж тэмдэглэх` }),
    );
    // Moves into the (collapsed) Done group.
    await waitFor(() => {
      expect(within(group('Хийх')).queryByText(title)).not.toBeInTheDocument();
    });
    expect(toggleOf('Дууссан')).toHaveTextContent('2');
    expect(
      fetchMock.mock.calls.find(([url]) => href(url).endsWith('/complete'))?.[1],
    ).toMatchObject({ method: 'POST', body: JSON.stringify({ done: true }) });

    // A failing toggle puts the row back where it was.
    fail = true;
    fireEvent.click(toggleOf('Дууссан'));
    const checkbox = await screen.findByRole('checkbox', {
      name: `«${title}» ажлыг дуусаагүй болгох`,
    });
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url]) => href(url).endsWith('/complete'))).toHaveLength(
        2,
      );
    });
    await waitFor(() => {
      expect(
        within(group('Дууссан')).getByRole('checkbox', {
          name: `«${title}» ажлыг дуусаагүй болгох`,
        }),
      ).toBeChecked();
    });
  });

  it('adds tasks inline: Enter creates in the group and keeps focus, Esc cancels', async () => {
    const created: unknown[] = [];
    api((st) => ({
      [`POST /api/v1/projects/${PROJECT_ID}/tasks`]: (init) => {
        created.push(body(init));
        const progress = statusOf('in_progress');
        const task = {
          ...at(st.tasks, 0),
          id: '01890000-0000-7000-8000-000000009999',
          key: 'APP-199',
          title: 'Write release blog',
          status: { id: progress.id, name: null, category: 'in_progress' as const, color: null },
          position: 'z9',
        };
        st.tasks = [...st.tasks, task];
        return Response.json(detail(task), { status: 201 });
      },
    }));
    renderAt(LIST);

    await screen.findByRole('table');
    fireEvent.click(within(group('Хийгдэж буй')).getByRole('button', { name: 'Ажил нэмэх' }));
    const input = within(group('Хийгдэж буй')).getByRole('textbox', { name: 'Шинэ ажлын нэр' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  Write release blog ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
    expect(await within(group('Хийгдэж буй')).findByText('Write release blog')).toBeInTheDocument();
    await waitFor(() => {
      expect(created).toEqual([
        { title: 'Write release blog', statusId: statusOf('in_progress').id, position: 'bottom' },
      ]);
    });

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Шинэ ажлын нэр' })).not.toBeInTheDocument();
  });

  it('keeps filters in the URL with removable chips', async () => {
    api();
    const router = renderAt(LIST);
    fireEvent.click(await screen.findByRole('button', { name: 'Шүүлтүүр' }));
    fireEvent.click(await screen.findByRole('button', { name: /Ач холбогдол/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Яаралтай' }));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('priority')).toBe('urgent');
    });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(await screen.findByText('Ач холбогдол:')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Шүүлтүүрийг арилгах' }));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('priority')).toBe(false);
    });
  });

  it('j/k move the selection, x completes, Enter opens the drawer', async () => {
    const { fetchMock, state } = api((st) => ({
      [`POST /api/v1/tasks/${at(st.tasks, 1).id}/complete`]: () => Response.json(st.tasks[1]),
      'GET /api/v1/tasks/APP-131': () => Response.json(detail(at(st.tasks, 0))),
    }));
    const router = renderAt(LIST);
    await screen.findByRole('table');

    fireEvent.keyDown(document.body, { key: 'j' });
    expect(rowOf('Audit current navigation patterns')).toHaveFocus();
    fireEvent.keyDown(focused(), { key: 'j' });
    expect(rowOf('Define color tokens for dark mode')).toHaveFocus();
    fireEvent.keyDown(focused(), { key: 'x' });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) =>
          href(url).includes(`${at(state.tasks, 1).id}/complete`),
        ),
      ).toBe(true);
    });

    fireEvent.keyDown(document.body, { key: 'k' });
    expect(rowOf('Audit current navigation patterns')).toHaveFocus();
    fireEvent.keyDown(focused(), { key: 'Enter' });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).get('task')).toBe('APP-131');
    });
    expect(await screen.findByRole('dialog', { name: 'APP-131 ажил' })).toBeInTheDocument();
  });

  it('opens the drawer when a row is clicked', async () => {
    api((st) => ({
      'GET /api/v1/tasks/APP-131': () => Response.json(detail(at(st.tasks, 0))),
      [`GET /api/v1/tasks/${at(st.tasks, 0).id}/activity`]: () => Response.json([]),
    }));
    const router = renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(rowOf('Audit current navigation patterns'));
    const dialog = await screen.findByRole('dialog', { name: 'APP-131 ажил' });
    expect(await within(dialog).findByRole('textbox', { name: 'Ажлын нэр' })).toHaveValue(
      'Audit current navigation patterns',
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Хаах' }));
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('task')).toBe(false);
    });
  });

  it('shows the empty project with templates', async () => {
    const empty = { ...PROJECT_WITH_STATUSES, taskCount: 0, doneCount: 0, activeSprint: null };
    const applied: unknown[] = [];
    api(
      (st) => ({
        [`POST /api/v1/projects/${PROJECT_ID}/from-template`]: (init) => {
          applied.push(body(init));
          st.tasks = makeTasks();
          st.project = { ...empty, taskCount: st.tasks.length };
          return Response.json(
            { createdCount: st.tasks.length, project: st.project },
            { status: 201 },
          );
        },
      }),
      newState([], empty),
    );
    renderAt(`/p/${PROJECT_ID}/list`);

    expect(
      await screen.findByRole('heading', { name: '«App Redesign» төсөлд одоогоор ажил алга' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Шүүлтүүр' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Спринт төлөвлөлт/ }));
    await waitFor(() => {
      expect(applied).toEqual([{ templateId: 'sprint-planning' }]);
    });
    expect(await screen.findByText('Audit current navigation patterns')).toBeInTheDocument();
  });

  it('"Create first task" opens quick create for the project', async () => {
    const empty = { ...PROJECT_WITH_STATUSES, taskCount: 0, doneCount: 0, activeSprint: null };
    api(undefined, newState([], empty));
    renderAt(`/p/${PROJECT_ID}/list`);

    fireEvent.click(await screen.findByRole('button', { name: /Эхний ажлаа үүсгэх/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Шинэ ажил' });
    await waitFor(() => {
      expect(within(dialog).getByRole('textbox', { name: 'Ажлын нэр' })).toHaveFocus();
    });
    expect(useUiStore.getState().createDefaults).toEqual({ projectId: PROJECT_ID });
  });

  it('a group header "+" opens quick create with the group\'s status', async () => {
    api();
    renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(
      within(group('Хийгдэж буй')).getByRole('button', {
        name: '«Хийгдэж буй» бүлэгт ажил нэмэх',
      }),
    );
    expect(useUiStore.getState().createDefaults).toEqual({
      projectId: PROJECT_ID,
      statusId: statusOf('in_progress').id,
    });
    expect(await screen.findByRole('dialog', { name: 'Шинэ ажил' })).toBeInTheDocument();
  });
});

describe('space list', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ collapsedGroups: {}, createOpen: false });
    await i18n.changeLanguage('mn');
  });

  it('lists every project of the space by status category, with the project on each row', async () => {
    api((st) => ({ [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json(st.tasks) }));
    renderAt(`/s/${SPACE_ID}/list`);

    const todo = await waitFor(() => group('Хийх'));
    expect(within(todo).getAllByText('App Redesign')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Ажил нэмэх' })).not.toBeInTheDocument();
    await act(async () => {
      await Promise.resolve();
    });
  });
});
