import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { appPath, switchTarget, wsPath } from '../../lib/paths';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { homeHandlers } from '../../test/home';
import { listHandlers } from '../../test/tasks';

const LABS_ID = '01890000-0000-7000-8000-0000000000a2';
const LABS = { id: LABS_ID, name: 'Kite Labs', slug: 'kite-labs', role: 'member', title: null };
// English, so the assertions read like the UI copy.
const EN = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const TWO = { ...EN, workspaces: [...ME.workspaces, LABS] };
const LABS_SIDEBAR = { ...SIDEBAR, spaces: [] };

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

function api(me: unknown = TWO, extra: Record<string, () => Response> = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => Response.json(me),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    [`GET /api/v1/workspaces/${LABS_ID}/sidebar`]: () => Response.json(LABS_SIDEBAR),
    'GET /api/v1/me/notifications/unread-counts': () =>
      Response.json([
        { workspaceId: WORKSPACE_ID, unread: 3 },
        { workspaceId: LABS_ID, unread: 2 },
      ]),
    ...listHandlers(),
    ...homeHandlers(),
    ...extra,
  });
}

describe('workspace paths', () => {
  it('builds and strips the workspace prefix', () => {
    expect(wsPath('kite-labs', '/p/1/list')).toBe('/w/kite-labs/p/1/list');
    expect(appPath('/w/kite-labs/p/1/list')).toBe('/p/1/list');
    expect(appPath('/w/kite-labs')).toBe('/');
    expect(appPath('/login')).toBe('/login');
  });

  it('keeps the section when switching, else My Tasks', () => {
    expect(switchTarget('kite-labs', '/w/kite-studio/inbox')).toBe('/w/kite-labs/inbox');
    expect(switchTarget('kite-labs', '/w/kite-studio/reports/people/1')).toBe(
      '/w/kite-labs/reports',
    );
    expect(switchTarget('kite-labs', '/w/kite-studio/p/1/board')).toBe('/w/kite-labs/my-tasks');
  });
});

describe('workspaces in the URL', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.persist.setOptions({ name: 'kite.ui' });
    useUiStore.setState({ sidebarCollapsed: false, openSpaces: {}, lastWorkspaceId: null });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('en');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends old links and / to the workspace used last, keeping the query', async () => {
    api();
    useUiStore.setState({ lastWorkspaceId: LABS_ID });
    const router = renderAt('/inbox?tab=mentions');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/w/kite-labs/inbox');
    });
    expect(router.state.location.search).toBe('?tab=mentions');
  });

  it('opens a project of another workspace in that workspace', async () => {
    api();
    const router = renderAt(`/w/kite-labs/p/${PROJECT_ID}/list?sprint=none`);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/w/kite-studio/p/${PROJECT_ID}/list`);
    });
    expect(router.state.location.search).toBe('?sprint=none');
    await waitFor(() => {
      expect(useUiStore.getState().lastWorkspaceId).toBe(WORKSPACE_ID);
    });
  });

  it('never opens a workspace I am not in', async () => {
    api();
    const router = renderAt('/w/someone-else/my-tasks');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/w/kite-studio/my-tasks');
    });
  });

  it('switches workspace from the sidebar, showing unread elsewhere', async () => {
    api();
    const router = renderAt('/w/kite-studio/my-tasks');
    const trigger = await screen.findByRole('button', {
      name: 'Kite Studio — Switch workspace. New notifications in another workspace',
    });
    fireEvent.click(trigger);
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Kite Studio' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const labs = within(menu).getByRole('menuitemradio', { name: /^Kite Labs/ });
    expect(within(labs).getByLabelText('2 unread')).toHaveTextContent('2');
    fireEvent.click(labs);
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/w/kite-labs/my-tasks');
    });
    expect(
      await screen.findByRole('button', {
        name: 'Kite Labs — Switch workspace. New notifications in another workspace',
      }),
    ).toBeInTheDocument();
  });

  it('tells someone without a workspace to ask for an invite', async () => {
    api({ ...EN, workspaces: [] });
    renderAt('/my-tasks');
    expect(await screen.findByRole('heading', { name: 'No workspace yet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
