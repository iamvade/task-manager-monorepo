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
    .getAllByRole('link', { hidden: true })
    .map((a) => a.textContent.replace(/\d+/g, '').trim());
};
/** Opens a row's dropdown in the Customize dialog and picks a visibility. */
async function setVisibility(panel: HTMLElement, name: string, choice: string) {
  fireEvent.click(within(panel).getByRole('button', { name: new RegExp(`^Харуулах: ${name}:`) }));
  // The menu is named by its trigger ("Харуулах: Тайлан: Харуулахгүй").
  const menu = await screen.findByRole('menu', { name: new RegExp(`^Харуулах: ${name}:`) });
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: choice }));
}
async function openCustomize(nav: HTMLElement) {
  fireEvent.click(within(nav).getByRole('button', { name: /^Бусад/ }));
  const menu = await screen.findByRole('menu', { name: 'Бусад' });
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Хажуу самбар тохируулах…' }));
  return screen.findByRole('dialog', { name: 'Хажуу самбар тохируулах' });
}
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
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('mn');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows Inbox, My Tasks, Personal, Standup by default; More opens a menu with the rest', async () => {
    api();
    const router = renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');

    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Стэндап']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Бусад' }));
    const menu = await screen.findByRole('menu', { name: 'Бусад' });
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((el) => el.textContent),
    ).toEqual(['Outlook календарь', 'Санал хүсэлт', 'Тайлан', 'Хажуу самбар тохируулах…']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Тайлан' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toMatch(/^\/w\/kite-studio\/reports/);
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

  it('customizes where each optional link shows; Reset restores', async () => {
    api();
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');

    const panel = await openCustomize(nav);
    // Only the optional links are editable (Personal and Standup included).
    expect(within(panel).getAllByRole('button', { name: /^Зөөх: / })).toHaveLength(5);
    expect(within(panel).queryByText('Мэдэгдэл')).not.toBeInTheDocument();

    await setVisibility(panel, 'Тайлан', 'Үргэлж харуулах');
    await setVisibility(panel, 'Стэндап', 'Харуулахгүй');
    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Тайлан']);
    await waitFor(() => {
      expect(saved()).toMatchObject({
        navItems: [
          { key: 'personal', visibility: 'always' },
          { key: 'standup', visibility: 'hidden' },
          { key: 'outlook', visibility: 'hidden' },
          { key: 'feedback', visibility: 'hidden' },
          { key: 'reports', visibility: 'always' },
        ],
      });
    });

    fireEvent.click(within(panel).getByRole('button', { name: 'Анхны байдалд оруулах' }));
    expect(topLinks(nav)).toEqual(['Мэдэгдэл', 'Миний ажлууд', 'Хувийн', 'Стэндап']);
  });

  it('offers "Show when badged" only for links with a badge; such a link shows while it has one', async () => {
    api({ ...SIDEBAR, feedbackUnreadCount: 2 });
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');

    // The filter button opens the same dialog.
    fireEvent.click(within(nav).getByRole('button', { name: 'Хажуу самбар тохируулах' }));
    const panel = await screen.findByRole('dialog', { name: 'Хажуу самбар тохируулах' });

    fireEvent.click(within(panel).getByRole('button', { name: /^Харуулах: Тайлан:/ }));
    const reports = await screen.findByRole('menu', { name: /^Харуулах: Тайлан:/ });
    expect(
      within(reports)
        .getAllByRole('menuitemradio')
        .map((el) => el.textContent),
    ).toEqual(['Үргэлж харуулах', 'Харуулахгүй']);
    fireEvent.keyDown(reports, { key: 'Escape' });

    await setVisibility(panel, 'Санал хүсэлт', 'Тэмдэгтэй үед харуулах');
    expect(topLinks(nav)).toEqual([
      'Мэдэгдэл',
      'Миний ажлууд',
      'Хувийн',
      'Стэндап',
      'Санал хүсэлт',
    ]);
  });

  it('keeps a "Show when badged" link under More while it has no badge', async () => {
    api();
    useUiStore.setState({
      navItems: initialUiState.navItems.map((p) =>
        p.key === 'feedback' ? { ...p, visibility: 'badged' as const } : p,
      ),
    });
    renderAt('/w/kite-studio/my-tasks');
    const nav = await waitFor(sidebarNav);
    await within(nav).findByLabelText('3 уншаагүй');
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

    // The rail's More also leads to Customize sidebar.
    fireEvent.click(within(nav).getByRole('button', { name: 'Бусад' }));
    const again = await screen.findByRole('menu', { name: 'Бусад' });
    fireEvent.click(within(again).getByRole('menuitem', { name: 'Хажуу самбар тохируулах…' }));
    expect(
      await screen.findByRole('dialog', { name: 'Хажуу самбар тохируулах' }),
    ).toBeInTheDocument();
  });
});
