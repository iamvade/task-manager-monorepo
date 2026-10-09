import type { TaskListItem } from '@kite/shared';
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
import { ME, PROJECT, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at, listHandlers, makeTasks, statusOf } from '../../test/tasks';

const LIST = `/p/${PROJECT_ID}/list?sprint=none`;
const SARA = at(PROJECT.members, 1).user;
const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };

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

const detail = (task: TaskListItem) => ({
  ...task,
  description: null,
  descriptionText: '',
  sprint: null,
  creator: ME.user,
  subtasks: [],
  attachments: [],
  followers: [],
  deletedAt: null,
});

/** The list API plus a create endpoint that records bodies and answers APP-200. */
function api({ fail = false } = {}) {
  const tasks = makeTasks();
  const created: unknown[] = [];
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => tasks),
    [`POST /api/v1/projects/${PROJECT_ID}/tasks`]: (init) => {
      const body = JSON.parse(init?.body as string) as { title: string };
      created.push(body);
      if (fail) {
        return Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 });
      }
      const task = {
        ...at(tasks, 0),
        id: '01890000-0000-7000-8000-000000009999',
        key: 'APP-200',
        title: body.title,
      };
      tasks.push(task);
      return Response.json(detail(task), { status: 201 });
    },
  });
  return { created, fetchMock };
}

async function openModal() {
  await screen.findByRole('table');
  fireEvent.keyDown(document.body, { key: 'c' });
  const dialog = await screen.findByRole('dialog', { name: 'New task' });
  const title = within(dialog).getByRole('textbox', { name: 'Task title' });
  await waitFor(() => {
    expect(title).toHaveFocus();
  });
  // Project data (statuses) has arrived once the project chip shows.
  await within(dialog).findByRole('button', { name: 'Project: App Redesign' });
  return { dialog, title };
}

describe('quick create', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({
      collapsedGroups: {},
      lastWorkspaceId: null,
      createOpen: false,
      createMore: false,
      paletteOpen: false,
      shortcutsOpen: false,
    });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens on C with the title focused and closes on Esc', async () => {
    api();
    renderAt(LIST);
    const { dialog, title } = await openModal();
    expect(within(dialog).getByRole('button', { name: /^Create task/ })).toBeDisabled();
    // Typing in the title never triggers the A/D/P keys.
    fireEvent.keyDown(title, { key: 'a' });
    expect(screen.queryByRole('listbox', { name: 'Assignees' })).toBeNull();

    fireEvent.keyDown(title, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
    });
  });

  it('picks assignee and due by keyboard and creates with ⌘↵', async () => {
    const { created } = api();
    const router = renderAt(LIST);
    const { dialog, title } = await openModal();
    // Single keys work wherever focus isn't in a text field, e.g. on a chip.
    const chip = within(dialog).getByRole('button', { name: 'Project: App Redesign' });

    // A: assignee picker; search, ↵ picks and closes.
    fireEvent.keyDown(chip, { key: 'a' });
    const people = await screen.findByRole('listbox', { name: 'Assignees' });
    expect(within(people).getByRole('option', { name: /Unassigned/ })).toBeInTheDocument();
    const search = screen.getByRole('combobox', { name: 'Assign to…' });
    fireEvent.change(search, { target: { value: 'sara' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(
      await within(dialog).findByRole('button', { name: 'Assignee: Sara K.' }),
    ).toBeInTheDocument();

    // ⌫ on an empty search unassigns.
    fireEvent.keyDown(chip, { key: 'a' });
    fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Assign to…' }), {
      key: 'Backspace',
    });
    expect(
      await within(dialog).findByRole('button', { name: 'Assignee: Unassigned' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(chip, { key: 'a' });
    const again = await screen.findByRole('combobox', { name: 'Assign to…' });
    fireEvent.change(again, { target: { value: 'sara' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await within(dialog).findByRole('button', { name: 'Assignee: Sara K.' });

    // D: typed natural-language date.
    fireEvent.keyDown(chip, { key: 'd' });
    const dateInput = await screen.findByRole('combobox', { name: 'Type a date, e.g. “next fri”' });
    fireEvent.change(dateInput, { target: { value: 'next fri' } });
    expect(await screen.findByRole('option', { name: /Fri, Oct 16/ })).toBeInTheDocument();
    fireEvent.keyDown(dateInput, { key: 'Enter' });
    expect(
      await within(dialog).findByRole('button', { name: 'Due date: Oct 16' }),
    ).toBeInTheDocument();

    fireEvent.change(title, { target: { value: '  Ship the beta ' } });
    fireEvent.keyDown(title, { key: 'Enter', metaKey: true });

    await waitFor(() => {
      expect(created).toEqual([
        {
          title: 'Ship the beta',
          statusId: statusOf('todo').id,
          position: 'bottom',
          assigneeIds: [SARA.id],
          dueDate: '2026-10-16',
        },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
    });
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['Created APP-200']);
    expect(router.state.location.search).not.toContain('task=');
  });

  it('⇧⌘↵ creates and opens the task in the drawer', async () => {
    api();
    const router = renderAt(LIST);
    const { title } = await openModal();
    fireEvent.change(title, { target: { value: 'Open me' } });
    fireEvent.keyDown(title, { key: 'Enter', metaKey: true, shiftKey: true });
    await waitFor(() => {
      expect(router.state.location.search).toContain('task=APP-200');
    });
    expect(router.state.location.pathname).toBe(`/p/${PROJECT_ID}/list`);
    expect(screen.queryByRole('dialog', { name: 'New task' })).toBeNull();
  });

  it('"Create more" keeps the modal open with the fields, ready for the next title', async () => {
    const { created } = api();
    renderAt(LIST);
    const { dialog, title } = await openModal();
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Create more' }));
    fireEvent.change(title, { target: { value: 'First' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create task/ }));
    await waitFor(() => {
      expect(created).toHaveLength(1);
    });
    await waitFor(() => {
      expect(title).toHaveValue('');
    });
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeInTheDocument();
    expect(title).toHaveFocus();
    expect(useUiStore.getState().createMore).toBe(true);
  });

  it('keeps the modal and its text when the create fails', async () => {
    api({ fail: true });
    renderAt(LIST);
    const { dialog, title } = await openModal();
    fireEvent.change(title, { target: { value: 'Will fail' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create task/ }));
    await waitFor(() => {
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
        "Couldn't create the task. Try again.",
      ]);
    });
    expect(title).toHaveValue('Will fail');
  });

  it('starts with the status of the group it was opened from', async () => {
    const { created } = api();
    renderAt(LIST);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Add task to In Review' }));
    const dialog = await screen.findByRole('dialog', { name: 'New task' });
    expect(
      await within(dialog).findByRole('button', { name: 'Status: In Review' }),
    ).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Review copy' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Create task/ }));
    await waitFor(() => {
      expect(created).toEqual([
        { title: 'Review copy', statusId: statusOf('review').id, position: 'bottom' },
      ]);
    });
  });
});
