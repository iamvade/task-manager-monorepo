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
    reviewer: null,
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

  it('sets the size from the S/M/L/XL control and clears it on a second click', async () => {
    const { state, task } = setup();
    const patches: unknown[] = [];
    api(state, (s) => ({
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        const patch = body(init) as { size: TaskDetail['size'] };
        patches.push(patch);
        s.detail = { ...s.detail, size: patch.size };
        return Response.json(s.detail);
      },
    }));
    renderAt(`${LIST}&task=APP-135`);

    const sizes = await within(await drawer()).findByRole('radiogroup', { name: 'Size' });
    expect(within(sizes).getAllByRole('radio', { checked: false })).toHaveLength(4);
    expect(screen.getByText('No size · used in Workload and Throughput reports')).toBeVisible();
    const large = within(sizes).getByRole('radio', { name: 'L' });
    expect(large).toHaveAttribute('title', 'L = 5 points · Large · 3–4 days');

    fireEvent.click(large);
    await waitFor(() => {
      expect(large).toHaveAttribute('aria-checked', 'true');
    });
    expect(screen.getByText('= 5 points · used in Workload and Throughput reports')).toBeVisible();
    fireEvent.click(large);
    await waitFor(() => {
      expect(patches).toEqual([{ size: 'L' }, { size: null }]);
    });
  });

  it('creates a sprint from the sprint picker and puts the task in it', async () => {
    const { state, task } = setup();
    const created: unknown[] = [];
    const patches: unknown[] = [];
    const sprint = {
      id: '01890000-0000-7000-8000-000000000031',
      projectId: PROJECT_ID,
      number: 2,
      name: 'Polish',
      startDate: '2026-10-26',
      endDate: '2026-11-12',
    };
    api(state, (s) => ({
      [`POST /api/v1/projects/${PROJECT_ID}/sprints`]: (init) => {
        created.push(body(init));
        return Response.json(sprint, { status: 201 });
      },
      [`PATCH /api/v1/tasks/${task.id}`]: (init) => {
        const patch = body(init) as { sprintId: string };
        patches.push(patch);
        s.detail = { ...s.detail, sprintId: patch.sprintId, sprint };
        return Response.json(s.detail);
      },
    }));
    renderAt(`${LIST}&task=APP-135`);

    fireEvent.click(await within(await drawer()).findByRole('button', { name: 'Sprint' }));
    fireEvent.click(await screen.findByRole('button', { name: 'New sprint' }));
    const form = await screen.findByRole('dialog', { name: 'New sprint' });
    // Follows Sprint 1 (Oct 6 – Oct 24: 14 working days).
    expect(within(form).getByLabelText('Start')).toHaveValue('2026-10-26');
    expect(within(form).getByLabelText('End')).toHaveValue('2026-11-12');
    const name = within(form).getByLabelText('Name (optional)');
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('placeholder', 'Sprint 2');

    fireEvent.change(name, { target: { value: ' Polish ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create sprint' }));
    await waitFor(() => {
      expect(patches).toEqual([{ sprintId: sprint.id }]);
    });
    expect(created).toEqual([{ name: 'Polish', startDate: '2026-10-26', endDate: '2026-11-12' }]);
    expect(screen.queryByRole('dialog', { name: 'New sprint' })).toBeNull();
  });

  it('shows the reviewer only while the task is in review', async () => {
    const { state } = setup({ reviewerId: BAT.id, reviewer: ref(BAT) });
    api(state);
    renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    expect(await within(dialog).findByRole('button', { name: 'Reviewer' })).toHaveTextContent(
      'Bat O.',
    );
  });

  it('hides the reviewer outside review', async () => {
    const tasks = makeTasks();
    const task = at(tasks, 0);
    api({ tasks, detail: toDetail(task), feed: [] });
    renderAt(`${LIST}&task=${task.key}`);
    await screen.findByRole('dialog', { name: `Task ${task.key}` });
    await screen.findByRole('radiogroup', { name: 'Size' });
    expect(screen.queryByRole('button', { name: 'Reviewer' })).toBeNull();
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

  it('asks in a dialog before deleting a comment', async () => {
    const { state, task } = setup();
    const commentId = '01890000-0000-7000-8000-700000000009';
    state.feed = [
      {
        kind: 'comment',
        id: commentId,
        taskId: task.id,
        parentId: null,
        author: ref(at(PROJECT.members, 0).user),
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Old note' }] }],
        },
        bodyText: 'Old note',
        createdAt: '2026-10-07T06:00:00.000Z',
        editedAt: null,
        deletedAt: null,
        replies: [],
      },
    ];
    const deleted: string[] = [];
    api(state, (s) => ({
      [`DELETE /api/v1/comments/${commentId}`]: () => {
        deleted.push(commentId);
        s.feed = s.feed.filter((item) => item.id !== commentId);
        return new Response(null, { status: 204 });
      },
    }));
    renderAt(`${LIST}&task=APP-135`);
    const dialog = await drawer();
    const feed = within(await within(dialog).findByRole('region', { name: /Activity/ }));
    expect(await feed.findByText('Old note')).toBeInTheDocument();

    fireEvent.click(feed.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Delete this comment?' })).toBeNull();
    });
    expect(deleted).toEqual([]);
    expect(feed.getByText('Old note')).toBeInTheDocument();

    fireEvent.click(feed.getByRole('button', { name: 'Comment options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const again = await screen.findByRole('dialog', { name: 'Delete this comment?' });
    fireEvent.click(within(again).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(deleted).toEqual([commentId]);
    });
    await waitFor(() => {
      expect(feed.queryByText('Old note')).toBeNull();
    });
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
    // Closing replaces the history entry, so Back goes to the previous screen (F-26).
    expect(router.state.historyAction).toBe('REPLACE');
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
