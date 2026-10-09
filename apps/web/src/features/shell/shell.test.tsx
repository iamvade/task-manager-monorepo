import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthProvider';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { routes } from '../../router';
import { useUiStore } from '../../stores/ui';
import { ME, PROJECT_ID, SIDEBAR, SPRINT_ID, WORKSPACE_ID, mockApi } from '../../test/fixtures';
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

function api(extra: Record<string, (init?: RequestInit) => Response> = {}) {
  return mockApi({
    'GET /api/v1/auth/me': () => Response.json(ME),
    [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    ...listHandlers(),
    ...extra,
  });
}

const sidebarNav = () => screen.getByRole('navigation', { name: 'Ажлын орчин' });

describe('app shell', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ sidebarCollapsed: false, openSpaces: {}, lastWorkspaceId: null });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-08T03:00:00Z'));
    await i18n.changeLanguage('mn');
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the sidebar from /sidebar with counts and the active project', async () => {
    api();
    renderAt(`/p/${PROJECT_ID}/list`);

    const nav = await waitFor(sidebarNav);
    await within(nav).findByRole('link', { name: /App Redesign/ });
    expect(within(nav).getByRole('link', { name: /Миний ажлууд/ })).toHaveTextContent('7');
    expect(within(nav).getByLabelText('3 уншаагүй')).toHaveTextContent('3');
    // Product holds the active project → expanded; Engineering stays collapsed.
    expect(within(nav).getByRole('button', { name: 'Product' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(within(nav).getByRole('button', { name: 'Engineering' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(within(nav).queryByRole('link', { name: /Bug triage/ })).not.toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /App Redesign/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('shows the project header and auto-applies the active sprint filter', async () => {
    api();
    const router = renderAt(`/p/${PROJECT_ID}/list`);

    const crumb = await screen.findByRole('navigation', { name: 'Байршил' });
    expect(crumb).toHaveTextContent('Product');
    expect(crumb).toHaveTextContent('App Redesign');
    expect(screen.getByRole('img', { name: 'Төслийн 7 гишүүн' })).toHaveTextContent('+3');
    expect(await screen.findByText('10-р сарын 6 – 24')).toBeInTheDocument();
    expect(screen.getByText('7 ажил · 1 дууссан')).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?sprint=${SPRINT_ID}`);

    fireEvent.click(screen.getByRole('button', { name: 'Шүүлтүүрийг арилгах' }));
    await waitFor(() => {
      expect(router.state.location.search).toBe('?sprint=none');
    });
    expect(screen.queryByText('10-р сарын 6 – 24')).not.toBeInTheDocument();
  });

  it('switches views through the URL, keeping filters', async () => {
    api();
    const router = renderAt(`/p/${PROJECT_ID}/list?sprint=none`);

    const tabs = await screen.findByRole('tablist', { name: 'Харагдац' });
    expect(within(tabs).getByRole('tab', { name: 'Жагсаалт' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(within(tabs).getByRole('tab', { name: 'Самбар' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/p/${PROJECT_ID}/board`);
    });
    expect(router.state.location.search).toBe('?sprint=none');
    expect(within(tabs).getByRole('tab', { name: 'Самбар' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('collapses to the rail and remembers it', async () => {
    api();
    renderAt('/my-tasks');

    fireEvent.click(await screen.findByRole('button', { name: 'Хажуу самбарыг хураах' }));
    expect(
      await screen.findByRole('button', { name: 'Хажуу самбарыг дэлгэх' }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('kite.ui') ?? '{}')).toMatchObject({
      state: { sidebarCollapsed: true },
    });
  });

  it('flips every shell string when switching to English', async () => {
    const fetchMock = api({
      'PATCH /api/v1/me': () =>
        Response.json({ ...ME, preferences: { ...ME.preferences, locale: 'en' } }),
    });
    renderAt(`/p/${PROJECT_ID}/list`);

    fireEvent.click(await screen.findByRole('radio', { name: 'EN' }));
    expect(await screen.findByRole('link', { name: /My Tasks/ })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Board' })).toBeInTheDocument();
    expect(await screen.findByText('Oct 6 – Oct 24')).toBeInTheDocument();
    expect(screen.getByText('7 tasks · 1 done')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort: Due date' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group: Status' })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true);
    });
  });

  it('switches to the dark theme from the account menu', async () => {
    api({
      'PATCH /api/v1/me': () =>
        Response.json({ ...ME, preferences: { ...ME.preferences, theme: 'dark' } }),
    });
    renderAt('/my-tasks');

    fireEvent.click(await screen.findByRole('button', { name: /Бүртгэлийн цэс/ }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Бараан' }));
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });
});
