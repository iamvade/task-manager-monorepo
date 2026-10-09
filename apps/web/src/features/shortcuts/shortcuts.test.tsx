import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, SIDEBAR, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { at, listHandlers } from '../../test/tasks';

const EN_ME = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };

function renderList() {
  mockApi({
    'GET /api/v1/auth/me': () => Response.json(EN_ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(),
  });
  const router = createMemoryRouter(routes, {
    initialEntries: [`/p/${PROJECT_ID}/list?sprint=none`],
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('global shortcuts', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({
      collapsedGroups: {},
      createOpen: false,
      paletteOpen: false,
      shortcutsOpen: false,
    });
    await i18n.changeLanguage('en');
  });

  it('"?" shows the shortcuts help; Esc closes it', async () => {
    renderList();
    await screen.findByRole('table');
    fireEvent.keyDown(document.body, { key: '?', shiftKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(within(dialog).getByText('Open the command palette')).toBeInTheDocument();
    expect(within(dialog).getByText('Create and open')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
    });
  });

  it('G then I goes to the Inbox, G then M to My Tasks', async () => {
    const router = renderList();
    await screen.findByRole('table');
    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(document.body, { key: 'i' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/inbox');
    });
    fireEvent.keyDown(document.body, { key: 'g' });
    fireEvent.keyDown(document.body, { key: 'm' });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/my-tasks');
    });
  });

  it('ignores single keys while typing', async () => {
    renderList();
    await screen.findByRole('table');
    fireEvent.click(at(screen.getAllByRole('button', { name: 'Add task' }), 0));
    const input = await screen.findByRole('textbox', { name: 'New task title' });
    fireEvent.keyDown(input, { key: 'c' });
    fireEvent.keyDown(input, { key: '?', shiftKey: true });
    expect(useUiStore.getState()).toMatchObject({ createOpen: false, shortcutsOpen: false });
  });
});
