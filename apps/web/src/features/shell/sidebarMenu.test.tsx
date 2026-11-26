import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { initialUiState, useUiStore } from '../../stores/ui';
import { ME, SIDEBAR, SPACE_ID, WORKSPACE_ID, mockApi } from '../../test/fixtures';
import { homeHandlers } from '../../test/home';
import { listHandlers } from '../../test/tasks';

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

function api(sidebar = SIDEBAR) {
  return mockApi({
    'GET /api/v1/auth/me': () => Response.json(ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(sidebar),
    ...listHandlers(),
    ...homeHandlers(),
    [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json([]),
  });
}

const sidebarNav = () => screen.getByRole('navigation', { name: 'Ажлын орчин' });
/** Names of the top links, in order (up to the "Standup groups"/"Spaces" sections). */
const topLinks = (nav: HTMLElement) => {
  const menu = within(nav).getByText('Цэс').closest('div')?.parentElement;
  if (!menu) throw new Error('no menu');
  return within(menu)
    .getAllByRole('link')
    .map((a) => a.textContent.replace(/\d+/g, '').trim());
};
const saved = () =>
  (JSON.parse(localStorage.getItem(`kite.ui.${ME.user.id}`) ?? '{}') as { state?: unknown }).state;

describe('sidebar menu', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.persist.setOptions({ name: 'kite.ui' });
    useUiStore.setState({
      sidebarCollapsed: false,
      openSpaces: {},
      lastWorkspaceId: null,
      navItems: initialUiState.navItems,
      navMoreOpen: false,
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('mn');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the four fixed links first; the rest open under More and it is remembered', async () => {
    api();
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');

    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Стэндап']);
    const more = within(nav).getByRole('button', { name: 'Бусад' });
    expect(more).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(more);
    expect(within(nav).getByRole('button', { name: 'Хураах' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(topLinks(nav)).toEqual([
      'Мэдэгдэл',
      'Миний ажлууд',
      'Хувийн',
      'Стэндап',
      'Outlook календарь',
      'Санал хүсэлт',
      'Тайлан',
    ]);
    await waitFor(() => {
      expect(saved()).toMatchObject({ navMoreOpen: true });
    });
  });

  it('keeps a hidden link listed while its page is open', async () => {
    api();
    renderAt('/w/kite-studio/reports/overview');
    const nav = await waitFor(sidebarNav);
    const link = await within(nav).findByRole('link', { name: 'Тайлан' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Стэндап', 'Тайлан']);
  });

  it('puts a dot on More while a hidden link has unread items', async () => {
    api({ ...SIDEBAR, feedbackUnreadCount: 2 });
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    expect(await within(nav).findByRole('button', { name: 'Бусад, 2 шинэ' })).toBeInTheDocument();
  });

  it('customizes which optional links are shown and their order; Reset restores', async () => {
    api();
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');

    fireEvent.click(within(nav).getByRole('button', { name: 'Цэс тохируулах' }));
    const panel = await screen.findByRole('dialog', { name: 'Цэс тохируулах' });
    // Only the optional links are editable.
    expect(within(panel).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(panel).queryByText('Мэдэгдэл')).not.toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('checkbox', { name: 'Цэсэнд харуулах: Тайлан' }));
    fireEvent.click(
      within(panel).getByRole('checkbox', { name: 'Цэсэнд харуулах: Outlook календарь' }),
    );
    fireEvent.click(within(panel).getByRole('button', { name: 'Дээш зөөх: Тайлан' }));
    expect(
      within(panel).getByRole('button', { name: 'Дээш зөөх: Outlook календарь' }),
    ).toBeDisabled();

    expect(topLinks(nav)).toEqual([
      'Мэдэгдэл',
      'Миний ажлууд',
      'Хувийн',
      'Стэндап',
      'Outlook календарь',
      'Тайлан',
    ]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Дээш зөөх: Тайлан' }));
    expect(topLinks(nav).slice(4)).toEqual(['Тайлан', 'Outlook календарь']);
    await waitFor(() => {
      expect(saved()).toMatchObject({
        navItems: [
          { key: 'reports', shown: true },
          { key: 'outlook', shown: true },
          { key: 'feedback', shown: false },
        ],
      });
    });

    fireEvent.click(within(panel).getByRole('button', { name: 'Анхны байдалд оруулах' }));
    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Стэндап']);
  });

  it('collapsed rail: the short list plus a More menu with the rest', async () => {
    api();
    useUiStore.setState({ sidebarCollapsed: true });
    const router = renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    expect(within(nav).getByRole('link', { name: 'Хувийн' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Тайлан' })).not.toBeInTheDocument();

    fireEvent.click(within(nav).getByRole('button', { name: 'Бусад' }));
    const menu = await screen.findByRole('menu', { name: 'Бусад' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Тайлан' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/w\/kite-studio\/reports/);
    });
  });
});
