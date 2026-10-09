import type {
  Comment,
  FeedItem,
  RichTextNode,
  Subtask,
  TaskDetail,
  TaskListItem,
} from '@kite/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Editor } from '@tiptap/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at, listHandlers, makeTasks, statusOf } from '../../test/tasks';

type Handler = (init?: RequestInit) => Response;
const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;

const LIST = `/p/${PROJECT_ID}/list?sprint=none`;
const DORJ = at(PROJECT.members, 3).user;
const BAT = at(PROJECT.members, 6).user;
const ref = (u: typeof DORJ) => ({
  id: u.id,
  name: u.name,
  initials: u.initials,
  avatarColor: u.avatarColor as TaskListItem['assignees'][number]['avatarColor'],
});

const subtask = (n: number, title: string, done: boolean): Subtask => ({
  id: `01890000-0000-7000-8000-9000000000${String(n).padStart(2, '0')}`,
  title,
  assignee: ref(DORJ),
  dueDate: null,
  done,
  position: `a${String(n)}`,
});

function toDetail(task: TaskListItem, extra: Partial<TaskDetail> = {}): TaskDetail {
  return {
    ...task,
    description: null,
    descriptionText: '',
    sprint: null,
    creator: ref(at(PROJECT.members, 0).user),
    subtasks: [],
    attachments: [],
    followers: [],
    deletedAt: null,
    ...extra,
  };
}

interface State {
  tasks: TaskListItem[];
  detail: TaskDetail;
  feed: FeedItem[];
}

/** Stateful API: the list, one task's detail and its feed. */
function api(state: State, extra: (s: State) => Record<string, Handler> = () => ({})) {
  const id = state.detail.id;
  return mockApi({
    'GET /api/v1/auth/me': () =>
      Response.json({ ...ME, preferences: { ...ME.preferences, locale: 'en' } }),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => state.tasks),
    [`GET /api/v1/tasks/${state.detail.key}`]: () => Response.json(state.detail),
    [`GET /api/v1/tasks/${id}/activity`]: () => Response.json(state.feed),
    ...extra(state),
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

const drawer = () => screen.findByRole('dialog', { name: 'Task APP-135' });
// The drawer is modal: the list behind it is aria-hidden.
const group = (name: string) => screen.getByRole('rowgroup', { name, hidden: true });

function setup(extra?: Partial<TaskDetail>) {
  const tasks = makeTasks();
  const task = at(tasks, 4); // APP-135 Checkout page — responsive layout, In Review
  const state: State = { tasks, detail: toDetail(task, extra), feed: [] };
  return { state, task };
}

describe('task drawer', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ collapsedGroups: {}, lastWorkspaceId: null });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T06:00:00Z'));
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('saves the title on Enter and updates the row behind the drawer', async () => {
    const { state, task } = setup();
    const patches: unknown[] = [];
    api(state, (s) => ({
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        patches.push(body(init));
        s.detail = { ...s.detail, title: 'Checkout v2' };
        s.tasks = s.tasks.map((t) => (t.id === task.id ? { ...t, title: 'Checkout v2' } : t));
        return Response.json(s.detail);
      },
    }));
    renderAt(`${LIST}&task=APP-135`);

    const title = await within(await drawer()).findByRole('textbox', { name: 'Task title' });
    expect(title).toHaveValue('Checkout page — responsive layout');
    fireEvent.focus(title);
    fireEvent.change(title, { target: { value: 'Checkout v2' } });
    fireEvent.keyDown(title, { key: 'Enter' });
    fireEvent.blur(title);

    await waitFor(() => {
      expect(patches).toEqual([{ title: 'Checkout v2' }]);
    });
    expect(await within(group('In Review')).findByText('Checkout v2')).toBeInTheDocument();
  });

  it('changes the status from the listbox and moves the row to its group', async () => {
    const { state, task } = setup();
    const patches: unknown[] = [];
    const done = statusOf('done');
    api(state, (s) => ({
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        patches.push(body(init));
        const status = { id: done.id, name: null, category: 'done' as const, color: null };
        s.detail = { ...s.detail, status };
        s.tasks = s.tasks.map((t) => (t.id === task.id ? { ...t, status } : t));
        return Response.json(s.detail);
      },
    }));
    renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    await screen.findByRole('table', { hidden: true });

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Status: In Review' }));
    fireEvent.click(await screen.findByRole('option', { name: /Done/ }));

    await waitFor(() => {
      expect(patches).toEqual([{ statusId: done.id }]);
    });
    await waitFor(() => {
      expect(within(group('In Review')).queryByText(task.title)).toBeNull();
    });
    expect(within(dialog).getByRole('button', { name: 'Status: Done' })).toBeInTheDocument();
  });

  it('toggles and adds subtasks with the progress count', async () => {
    const subtasks = [
      subtask(1, 'Breakpoint audit', true),
      subtask(2, 'Collapse order summary', true),
      subtask(3, 'Single-column payment form', true),
      subtask(4, 'Sticky place order bar', true),
      subtask(5, 'Fix promo code overflow', true),
      subtask(6, 'QA on iOS Safari', false),
    ];
    const { state, task } = setup({ subtasks, subtaskProgress: { done: 5, total: 6 } });
    const sent: unknown[] = [];
    const last = at(subtasks, 5);
    const write = (s: State, next: Subtask[]) => {
      s.detail = {
        ...s.detail,
        subtasks: next,
        subtaskProgress: { done: next.filter((x) => x.done).length, total: next.length },
      };
    };
    api(state, (s) => ({
      [`PATCH /api/v1/subtasks/${last.id}`]: (init) => {
        sent.push(body(init));
        write(
          s,
          s.detail.subtasks.map((x) => (x.id === last.id ? { ...x, done: true } : x)),
        );
        return Response.json({ ...last, done: true });
      },
      [`POST /api/v1/tasks/${task.id}/subtasks`]: (init) => {
        sent.push(body(init));
        const created = subtask(7, 'Android check', false);
        write(s, [...s.detail.subtasks, created]);
        return Response.json(created, { status: 201 });
      },
    }));
    renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    const section = within(await within(dialog).findByRole('region', { name: /Subtasks/ }));
    expect(section.getByText('5/6')).toBeInTheDocument();

    fireEvent.click(section.getByRole('checkbox', { name: 'QA on iOS Safari' }));
    expect(await section.findByText('6/6')).toBeInTheDocument();

    const input = section.getByPlaceholderText('Add subtask');
    fireEvent.change(input, { target: { value: 'Android check' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await section.findByText('6/7')).toBeInTheDocument();
    expect(input).toHaveValue('');
    await waitFor(() => {
      expect(sent).toEqual([{ done: true }, { title: 'Android check', position: 'bottom' }]);
    });
  });

  it('renders history lines with bold names and status pills', async () => {
    const { state } = setup();
    const snap = (category: 'todo' | 'in_progress' | 'review') => ({
      id: statusOf(category).id,
      name: null,
      category,
    });
    const line = (n: number, type: string, payload: object, at: string): FeedItem =>
      ({
        kind: 'history',
        id: `01890000-0000-7000-8000-8${String(n).padStart(11, '0')}`,
        type,
        payload,
        actor: ref(DORJ),
        createdAt: at,
      }) as FeedItem;
    state.feed = [
      line(
        1,
        'status.changed',
        { from: snap('todo'), to: snap('in_progress') },
        '2026-10-04T02:00:00.000Z',
      ),
      line(
        2,
        'status.changed',
        { from: snap('in_progress'), to: snap('review') },
        '2026-10-07T08:12:00.000Z',
      ),
      line(3, 'priority.changed', { from: 'high', to: 'urgent' }, '2026-10-08T04:00:00.000Z'),
    ];
    api(state);
    renderAt(`${LIST}&task=APP-135`);
    const activity = within(
      await within(await drawer()).findByRole('region', { name: /Activity/ }),
    );

    const first = await activity.findByText(/changed status from/);
    expect(within(first).getByText('Dorj E.').tagName).toBe('STRONG');
    expect(first).toHaveTextContent('Dorj E. changed status from To Do to In Progress');
    expect(activity.getByText(/changed status to/)).toHaveTextContent(
      'Dorj E. changed status to In Review',
    );
    expect(activity.getByText('Yesterday, 4:12 PM')).toBeInTheDocument();
    expect(activity.getByText('2 hours ago')).toBeInTheDocument();
    expect(activity.getByText(/changed priority/)).toHaveTextContent(
      'Dorj E. changed priority from High to Urgent',
    );
  });

  it('posts a comment with a mention and appends it right away', async () => {
    const { state, task } = setup();
    const posted: { body: RichTextNode }[] = [];
    let release: () => void = () => undefined;
    api(state, (s) => ({
      [`POST /api/v1/tasks/${task.id}/comments`]: (init) => {
        posted.push(body(init) as (typeof posted)[number]);
        const created: Comment = {
          id: '01890000-0000-7000-8000-700000000001',
          taskId: task.id,
          parentId: null,
          author: ref(at(PROJECT.members, 0).user),
          body: posted[0]?.body ?? null,
          bodyText: 'Looping in @Bat O.',
          createdAt: '2026-10-08T06:00:00.000Z',
          editedAt: null,
          deletedAt: null,
          replies: [],
        };
        s.feed = [...s.feed, { ...created, kind: 'comment' }];
        return Response.json(created, { status: 201 });
      },
    }));
    // Hold the POST until the optimistic comment has been checked.
    const fetchSpy = vi.mocked(globalThis.fetch);
    const original = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation((input, init) =>
      init?.method === 'POST'
        ? new Promise((resolve) => {
            release = () => {
              resolve(original?.(input, init) as unknown as Response);
            };
          })
        : (original?.(input, init) ?? Promise.reject(new Error('no mock'))),
    );

    renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    const composer = await within(dialog).findByRole('textbox', { name: 'Write a comment' });
    const editor = (composer as HTMLElement & { editor?: Editor }).editor;
    if (!editor) throw new Error('no editor');
    act(() => {
      editor.commands.insertContent([
        { type: 'text', text: 'Looping in ' },
        { type: 'mention', attrs: { id: BAT.id, label: 'Bat O.' } },
      ]);
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Comment' }));

    // Optimistic: shown before the server answers, composer cleared.
    const feed = within(within(dialog).getByRole('region', { name: /Activity/ }));
    expect(await feed.findByText('@Bat O.')).toHaveClass('mention');
    expect(editor.isEmpty).toBe(true);
    act(() => {
      release();
    });

    await waitFor(() => {
      expect(posted).toHaveLength(1);
    });
    expect(at(posted, 0).body.content?.[0]?.content).toEqual([
      { type: 'text', text: 'Looping in ' },
      {
        type: 'mention',
        attrs: expect.objectContaining({ id: BAT.id, label: 'Bat O.' }) as object,
      },
    ]);
  });

  it('deletes with an undo toast that restores the task', async () => {
    const { state, task } = setup();
    const calls: string[] = [];
    api(state, (s) => ({
      [`DELETE /api/v1/tasks/${task.id}`]: () => {
        calls.push('delete');
        s.tasks = s.tasks.filter((t) => t.id !== task.id);
        return new Response(null, { status: 204 });
      },
      [`POST /api/v1/tasks/${task.id}/restore`]: () => {
        calls.push('restore');
        s.tasks = makeTasks();
        return Response.json(s.detail);
      },
    }));
    const router = renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    await screen.findByRole('table', { hidden: true });

    await within(dialog).findByRole('textbox', { name: 'Task title' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'More task actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('task')).toBe(false);
    });
    await waitFor(() => {
      expect(within(group('In Review')).queryByText(task.title)).toBeNull();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => {
      expect(calls).toEqual(['delete', 'restore']);
    });
    expect(await within(group('In Review')).findByText(task.title)).toBeInTheDocument();
  });

  it('closes an open picker on Esc before the drawer', async () => {
    const { state } = setup();
    api(state);
    const router = renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();

    fireEvent.click(await within(dialog).findByRole('button', { name: 'Status: In Review' }));
    const listbox = await screen.findByRole('listbox', { name: 'Status' });
    fireEvent.keyDown(listbox, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Status' })).toBeNull();
    });
    expect(screen.getByRole('dialog', { name: 'Task APP-135' })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(new URLSearchParams(router.state.location.search).has('task')).toBe(false);
    });
  });

  it('shows the task as a full page at /t/:key', async () => {
    const { state } = setup();
    api(state);
    renderAt('/t/APP-135');
    expect(await screen.findByRole('textbox', { name: 'Task title' })).toHaveValue(
      'Checkout page — responsive layout',
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });
});
