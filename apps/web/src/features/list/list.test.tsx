import type { ProjectDetail, TaskListItem } from '@kite/shared';
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
  reviewer: null,
  creator: task.assignees[0] ?? ME.user,
  subtasks: [],
  attachments: [],
  followers: [],
  mentionedIn: [],
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
      listColumns: { key: true, size: false },
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

    const stored = JSON.parse(localStorage.getItem(`kite.ui.${ME.user.id}`) ?? '{}') as {
      state: { collapsedGroups: Record<string, Record<string, boolean>> };
    };
    expect(stored.state.collapsedGroups[`p:${PROJECT_ID}`]).toEqual({
      [`status:${statusOf('done').id}`]: false,
      [`status:${statusOf('todo').id}`]: true,
    });
  });

  it('loads done tasks of the last 14 days until "Show all"', async () => {
    const { fetchMock } = api();
    renderAt(LIST);
    expect(await screen.findByText('Сүүлийн 14 хоногт дууссан')).toBeInTheDocument();
    const listUrls = () =>
      fetchMock.mock.calls.map(([input]) => href(input)).filter((u) => u.includes('/tasks'));
    expect(listUrls()).toContain(`/api/v1/projects/${PROJECT_ID}/tasks?doneSince=2026-09-25`);

    fireEvent.click(screen.getByRole('button', { name: 'Бүгдийг харах' }));
    expect(await screen.findByText('Бүх дууссан ажил')).toBeInTheDocument();
    await waitFor(() => {
      expect(listUrls()).toContain(`/api/v1/projects/${PROJECT_ID}/tasks`);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Зөвхөн сүүлийнх' }));
    expect(await screen.findByText('Сүүлийн 14 хоногт дууссан')).toBeInTheDocument();
  });

  it('deletes a row from its menu with an Undo toast that restores it', async () => {
    useToastStore.setState({ toasts: [] });
    const calls: string[] = [];
    const { state } = api((st) => {
      const audit = at(st.tasks, 0);
      return {
        [`DELETE /api/v1/tasks/${audit.id}`]: () => {
          calls.push('delete');
          st.tasks = st.tasks.filter((t) => t.id !== audit.id);
          return new Response(null, { status: 204 });
        },
        [`POST /api/v1/tasks/${audit.id}/restore`]: () => {
          calls.push('restore');
          st.tasks = [audit, ...st.tasks];
          return Response.json(detail(audit));
        },
      };
    });
    const audit = at(state.tasks, 0);
    renderAt(LIST);
    expect(await screen.findByText(audit.title)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: `«${audit.title}» — нэмэлт үйлдэл` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Устгах' }));
    // No confirm: the row goes right away and the toast offers Undo.
    await waitFor(() => {
      expect(screen.queryByText(audit.title)).toBeNull();
    });
    await waitFor(() => {
      expect(calls).toEqual(['delete']);
    });
    const toast = await screen.findByText(`${audit.key} устгагдлаа`);
    fireEvent.click(
      within(toast.closest('[role="status"]') ?? toast).getByRole('button', { name: 'Буцаах' }),
    );
    await waitFor(() => {
      expect(calls).toEqual(['delete', 'restore']);
    });
    expect(await screen.findByText(audit.title)).toBeInTheDocument();
  });

  it('sets the status from the row marker: optimistic, Undo for Done, rollback on error', async () => {
    useToastStore.setState({ toasts: [] });
    let fail = false;
    const patches: unknown[] = [];
    const moves: unknown[] = [];
    const { state } = api((st) => {
      const audit = at(st.tasks, 0);
      const set = (statusId: string) => {
        const status = st.project.statuses.find((s) => s.id === statusId) ?? audit.status;
        const next = {
          ...audit,
          status: { id: status.id, name: status.name, category: status.category, color: null },
          position: 'z0',
          completedAt: status.category === 'done' ? '2026-10-08T03:00:00.000Z' : null,
        };
        st.tasks = st.tasks.map((t) => (t.id === audit.id ? next : t));
        return next;
      };
      return {
        [`PATCH /api/v1/tasks/${audit.id}`]: (init) => {
          patches.push(body(init));
          if (fail)
            return Response.json({ error: { code: 'BOOM', message: 'x' } }, { status: 500 });
          const { statusId } = body(init) as { statusId: string };
          return Response.json(detail(set(statusId)));
        },
        [`POST /api/v1/tasks/${audit.id}/move`]: (init) => {
          moves.push(body(init));
          const { statusId } = body(init) as { statusId: string };
          return Response.json(set(statusId));
        },
      };
    });
    const title = at(state.tasks, 0).title;
    const key = at(state.tasks, 0).key;
    renderAt(LIST);

    const pick = async (from: string, to: string) => {
      fireEvent.click(await screen.findByRole('button', { name: `«${title}» — төлөв: ${from}` }));
      const listbox = await screen.findByRole('listbox');
      // The current status is highlighted.
      expect(within(listbox).getByRole('option', { name: from })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      fireEvent.click(within(listbox).getByRole('option', { name: to }));
    };

    // In Progress: the row moves, no toast.
    await pick('Хийх', 'Хийгдэж буй');
    await waitFor(() => {
      expect(within(group('Хийгдэж буй')).getByText(title)).toBeInTheDocument();
    });
    expect(patches).toEqual([{ statusId: statusOf('in_progress').id }]);
    expect(screen.queryByText(`${key} дууслаа`)).toBeNull();

    // Done: into the (collapsed) Done group, with Undo back to where it was.
    await pick('Хийгдэж буй', 'Дууссан');
    await waitFor(() => {
      expect(within(group('Хийгдэж буй')).queryByText(title)).not.toBeInTheDocument();
    });
    const toast = await screen.findByText(`${key} дууслаа`);
    fireEvent.click(
      within(toast.closest('[role="status"]') ?? toast).getByRole('button', { name: 'Буцаах' }),
    );
    await waitFor(() => {
      expect(moves).toMatchObject([{ statusId: statusOf('in_progress').id }]);
    });
    await waitFor(() => {
      expect(within(group('Хийгдэж буй')).getByText(title)).toBeInTheDocument();
    });

    // A failing change puts the row back.
    fail = true;
    await pick('Хийгдэж буй', 'Хянагдаж буй');
    await waitFor(() => {
      expect(patches).toHaveLength(3);
    });
    await waitFor(() => {
      expect(within(group('Хийгдэж буй')).getByText(title)).toBeInTheDocument();
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

  it('shows the optional Size column from the Columns menu', async () => {
    api();
    renderAt(LIST);
    await screen.findByRole('table', { name: 'App Redesign төслийн ажлууд' });
    expect(screen.queryByRole('columnheader', { name: 'Хэмжээ' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Багана' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Хэмжээ' }));
    expect(await screen.findByRole('columnheader', { name: 'Хэмжээ' })).toBeInTheDocument();
    const row = rowOf('Audit current navigation patterns');
    expect(
      within(row).getByRole('button', { name: '«Audit current navigation patterns» — хэмжээ' }),
    ).toBeInTheDocument();
    expect(useUiStore.getState().listColumns.size).toBe(true);
  });

  it('shows each task key before its title, and hides it from the Columns menu', async () => {
    api();
    renderAt(LIST);
    await screen.findByRole('table', { name: 'App Redesign төслийн ажлууд' });
    expect(within(rowOf('Audit current navigation patterns')).getByText('APP-131')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Багана' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Ажлын дугаар' }));
    await waitFor(() => {
      expect(within(rowOf('Audit current navigation patterns')).queryByText('APP-131')).toBeNull();
    });
    expect(useUiStore.getState().listColumns).toEqual({ key: false, size: false });
  });

  it('creates a tag from the tag picker and puts it on the task', async () => {
    const created: unknown[] = [];
    const tagged: unknown[] = [];
    const brand = { id: '01890000-0000-7000-8000-700000000077', name: 'Brand', color: 'teal' };
    api((st) => {
      const audit = at(st.tasks, 0);
      return {
        [`POST /api/v1/workspaces/${WORKSPACE_ID}/tags`]: (init) => {
          created.push(body(init));
          return Response.json(brand, { status: 201 });
        },
        [`PUT /api/v1/tasks/${audit.id}/tags`]: (init) => {
          tagged.push(body(init));
          return Response.json({ ...audit, tags: [...audit.tags, brand] });
        },
      };
    });
    renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(
      screen.getByRole('button', { name: '«Audit current navigation patterns» — шошго' }),
    );
    const search = await screen.findByRole('combobox', { name: 'Шошго хайх' });
    fireEvent.change(search, { target: { value: 'Brand' } });
    fireEvent.click(await screen.findByRole('option', { name: '«Brand» шошго үүсгэх' }));
    await waitFor(() => {
      expect(tagged).toHaveLength(1);
    });
    expect(created).toEqual([{ name: 'Brand', color: expect.any(String) as string }]);
    expect(tagged[0]).toEqual({ tagIds: [...at(makeTasks(), 0).tags.map((x) => x.id), brand.id] });
    // An exact name offers no create row.
    fireEvent.change(search, { target: { value: 'research' } });
    expect(screen.queryByRole('option', { name: /шошго үүсгэх/ })).toBeNull();
  });

  it('offers no "Create tag" to plain members', async () => {
    api(() => ({
      'GET /api/v1/auth/me': () =>
        Response.json({ ...ME, workspaces: ME.workspaces.map((w) => ({ ...w, role: 'member' })) }),
    }));
    renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(
      screen.getByRole('button', { name: '«Audit current navigation patterns» — шошго' }),
    );
    const search = await screen.findByRole('combobox', { name: 'Шошго хайх' });
    fireEvent.change(search, { target: { value: 'Brand' } });
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: /шошго үүсгэх/ })).toBeNull();
    });
  });

  it('replaces every assignee with "Reassign…" from the row menu', async () => {
    const sent: unknown[] = [];
    api((st) => {
      const tabBar = at(st.tasks, 2);
      return {
        [`PUT /api/v1/tasks/${tabBar.id}/assignees`]: (init) => {
          sent.push(body(init));
          return Response.json(tabBar);
        },
      };
    });
    renderAt(LIST);
    await screen.findByRole('table');
    const title = 'Implement new bottom tab bar';
    fireEvent.click(screen.getByRole('button', { name: `«${title}» — нэмэлт үйлдэл` }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Шилжүүлэх…' }));
    const search = await screen.findByRole('combobox', { name: 'Хэнд оноох…' });
    fireEvent.change(search, { target: { value: 'sara' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    const sara = at(PROJECT_WITH_STATUSES.members, 1).user;
    expect(sent[0]).toEqual({ userIds: [sara.id] });
  });

  it('selects rows (shift-click for a range) and changes them together, with Undo', async () => {
    useToastStore.setState({ toasts: [] });
    const batches: unknown[] = [];
    const deleted: unknown[] = [];
    api((st) => ({
      [`POST /api/v1/projects/${PROJECT_ID}/tasks/batch`]: (init) => {
        const b = body(init) as { updates: { id: string; priority?: string }[] };
        batches.push(b);
        st.tasks = st.tasks.map((t) => {
          const u = b.updates.find((x) => x.id === t.id);
          return u?.priority ? { ...t, priority: u.priority as typeof t.priority } : t;
        });
        return Response.json(st.tasks.filter((t) => b.updates.some((u) => u.id === t.id)));
      },
      [`POST /api/v1/projects/${PROJECT_ID}/tasks/batch-delete`]: (init) => {
        deleted.push(body(init));
        return new Response(null, { status: 204 });
      },
    }));
    renderAt(LIST);
    await screen.findByRole('table');
    const audit = 'Audit current navigation patterns';
    const tokens = 'Define color tokens for dark mode';
    fireEvent.click(screen.getByRole('checkbox', { name: `«${audit}» сонгох` }));
    fireEvent.click(screen.getByRole('checkbox', { name: `«${tokens}» сонгох` }), {
      shiftKey: true,
    });
    const bar = await screen.findByRole('toolbar', { name: 'Сонгосон 2 ажлын үйлдэл' });
    expect(within(bar).getByText('2 сонгосон')).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole('button', { name: /Ач холбогдол/ }));
    fireEvent.click(await screen.findByRole('option', { name: /^Өндөр/ }));
    await waitFor(() => {
      expect(batches).toHaveLength(1);
    });
    const ids = [at(makeTasks(), 0).id, at(makeTasks(), 1).id];
    expect(batches[0]).toEqual({
      updates: ids.map((id) => ({ id, priority: 'high' })),
    });
    await waitFor(() => {
      expect(useToastStore.getState().toasts[0]?.message).toBe('2 ажлыг «Өндөр» болголоо');
    });
    act(() => {
      useToastStore.getState().toasts[0]?.action?.onClick();
    });
    await waitFor(() => {
      expect(batches).toHaveLength(2);
    });
    expect(batches[1]).toEqual({
      updates: [
        { id: ids[0], priority: 'medium' },
        { id: ids[1], priority: 'low' },
      ],
    });

    fireEvent.click(within(bar).getByRole('button', { name: /Устгах/ }));
    await waitFor(() => {
      expect(deleted).toEqual([{ ids }]);
    });
    expect(screen.queryByRole('toolbar', { name: /Сонгосон/ })).toBeNull();
  });

  it('marks people who are out of office in the assignee picker', async () => {
    api(() => ({
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/members`]: () =>
        Response.json(
          PROJECT_WITH_STATUSES.members.map((m) =>
            m.user.name === 'Sara K.'
              ? {
                  ...m,
                  absences: [
                    {
                      id: '01990000-0000-7000-8000-0000000000a1',
                      startDate: '2026-10-01',
                      endDate: '2026-10-20',
                      note: null,
                    },
                  ],
                }
              : m,
          ),
        ),
    }));
    renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(
      screen.getByRole('button', { name: '«Audit current navigation patterns» — хариуцагч' }),
    );
    expect(await screen.findByRole('option', { name: /Sara K\./ })).toHaveTextContent(
      '10-р сарын 20 хүртэл чөлөөтэй',
    );
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

  it("loads the task's project statuses for the row status picker", async () => {
    const { fetchMock, state } = api((st) => ({
      [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json(st.tasks),
    }));
    const title = at(state.tasks, 0).title;
    renderAt(`/s/${SPACE_ID}/list`);

    const marker = await screen.findByRole('button', { name: `«${title}» — төлөв: Хийх` });
    const projectCalls = () =>
      fetchMock.mock.calls.filter(([url]) => href(url).endsWith(`/projects/${PROJECT_ID}`));
    expect(projectCalls()).toHaveLength(0);
    fireEvent.click(marker);
    const listbox = await screen.findByRole('listbox');
    await waitFor(() => {
      expect(within(listbox).getAllByRole('option')).toHaveLength(
        PROJECT_WITH_STATUSES.statuses.length,
      );
    });
    expect(projectCalls()).toHaveLength(1);
  });
});
