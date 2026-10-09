import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at, listHandlers, makeTasks } from '../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const LIST = `/p/${PROJECT_ID}/list?sprint=none`;
const SARA = at(PROJECT.members, 1).user;

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

function api() {
  const tasks = makeTasks();
  const task = at(tasks, 2);
  const searches: string[] = [];
  const updates: unknown[] = [];
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(() => tasks),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/search`]: () => {
      const input = fetchMock.mock.calls.at(-1)?.[0];
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.href : (input?.url ?? '');
      searches.push(new URL(url, 'http://x').searchParams.get('q') ?? '');
      return Response.json({
        tasks: [
          {
            id: task.id,
            key: task.key,
            title: task.title,
            project: task.project,
            status: task.status,
          },
        ],
        projects: [],
        people: [
          { id: SARA.id, name: SARA.name, initials: SARA.initials, avatarColor: SARA.avatarColor },
        ],
      });
    },
    'PATCH /api/v1/me': (init) => {
      const patch = JSON.parse(init?.body as string) as object;
      updates.push(patch);
      return Response.json({ ...EN_ME, preferences: { ...EN_ME.preferences, ...patch } });
    },
  });
  return { task, searches, updates };
}

/** cmdk names its input after the palette (`label`). */
async function openPalette(label = 'Command palette') {
  await screen.findByRole('table');
  fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
  const dialog = await screen.findByRole('dialog', { name: label });
  const input = within(dialog).getByRole('combobox', { name: label });
  await waitFor(() => {
    expect(input).toHaveFocus();
  });
  return { dialog, input };
}

describe('command palette', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({
      collapsedGroups: {},
      lastWorkspaceId: null,
      createOpen: false,
      paletteOpen: false,
      shortcutsOpen: false,
    });
    await i18n.changeLanguage('en');
  });

  it('opens on ⌘K, searches tasks and opens one in the drawer', async () => {
    const { task, searches } = api();
    const router = renderAt(LIST);
    const { dialog, input } = await openPalette();
    // Actions and the sidebar's projects before typing.
    expect(within(dialog).getByRole('option', { name: /New task/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('option', { name: /Checkout v2/ })).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'APP-13' } });
    const result = await within(dialog).findByRole('option', { name: new RegExp(task.title) });
    expect(searches.at(-1)).toBe('APP-13');
    fireEvent.click(result);

    await waitFor(() => {
      expect(router.state.location.search).toContain(`task=${task.key}`);
    });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });

  it('opens a person’s tasks as a filtered list', async () => {
    api();
    const router = renderAt(LIST);
    const { dialog, input } = await openPalette();
    fireEvent.change(input, { target: { value: 'sara' } });
    fireEvent.click(await within(dialog).findByRole('option', { name: /Sara K\./ }));
    await waitFor(() => {
      expect(router.state.location.search).toBe(`?assignee=${SARA.id}`);
    });
    expect(router.state.location.pathname).toBe(`/p/${PROJECT_ID}/list`);
  });

  it('runs actions: switch language, new task', async () => {
    const { updates } = api();
    renderAt(LIST);
    let { dialog, input } = await openPalette();
    fireEvent.change(input, { target: { value: 'language' } });
    const action = within(dialog).getByRole('option', { name: /Switch language/ });
    await waitFor(() => {
      expect(action).toHaveAttribute('aria-selected', 'true');
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(i18n.language).toBe('mn');
    });
    expect(updates).toEqual([{ locale: 'mn' }]);

    ({ dialog, input } = await openPalette('Тушаалын самбар'));
    fireEvent.change(input, { target: { value: 'шинэ' } });
    const newTask = within(dialog).getByRole('option', { name: /Шинэ ажил/ });
    await waitFor(() => {
      expect(newTask).toHaveAttribute('aria-selected', 'true');
    });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(await screen.findByRole('dialog', { name: 'Шинэ ажил' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Тушаалын самбар' })).toBeNull();
  });
});
