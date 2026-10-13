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
import {
  ME,
  PROJECT_ID,
  SIDEBAR,
  SPACE_ID,
  SPRINT_ID,
  WORKSPACE_ID,
  mockApi,
} from '../../test/fixtures';
import { homeHandlers } from '../../test/home';
import { PROJECT_WITH_STATUSES, listHandlers } from '../../test/tasks';

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
    ...homeHandlers(),
    [`GET /api/v1/spaces/${SPACE_ID}/tasks`]: () => Response.json([]),
    ...extra,
  });
}

const asMember = () =>
  Response.json({ ...ME, workspaces: ME.workspaces.map((w) => ({ ...w, role: 'member' })) });
const toasts = () => useToastStore.getState().toasts;

const body = (init?: RequestInit): unknown =>
  typeof init?.body === 'string' ? JSON.parse(init.body) : null;

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
    // Routes load lazily: the tabs re-render once the board's chunk is in.
    await waitFor(() => {
      expect(within(tabs).getByRole('tab', { name: 'Самбар' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
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
  it('creates a project from the space row and opens it', async () => {
    const posted: unknown[] = [];
    api({
      [`POST /api/v1/workspaces/${WORKSPACE_ID}/projects`]: (init) => {
        posted.push(body(init));
        return Response.json(PROJECT_WITH_STATUSES, { status: 201 });
      },
    });
    const router = renderAt('/my-tasks');

    const nav = await waitFor(sidebarNav);
    fireEvent.click(await within(nav).findByRole('button', { name: 'Product: шинэ төсөл' }));
    const form = await screen.findByRole('dialog', { name: 'Product: шинэ төсөл' });
    const create = within(form).getByRole('button', { name: 'Төсөл үүсгэх' });
    expect(create).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('Төслийн нэр'), {
      target: { value: '  App Redesign ' },
    });
    fireEvent.click(create);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/p/${PROJECT_ID}/list`);
    });
    expect(posted).toEqual([{ spaceId: SIDEBAR.spaces[0]?.id, name: 'App Redesign' }]);
    expect(screen.queryByRole('dialog', { name: 'Product: шинэ төсөл' })).toBeNull();
  });

  it('keeps the new-project form open with an error when creating fails', async () => {
    api({
      [`POST /api/v1/workspaces/${WORKSPACE_ID}/projects`]: () =>
        Response.json({ error: { code: 'INTERNAL', message: 'boom' } }, { status: 500 }),
    });
    renderAt('/my-tasks');

    const nav = await waitFor(sidebarNav);
    fireEvent.click(await within(nav).findByRole('button', { name: 'Engineering: шинэ төсөл' }));
    const form = await screen.findByRole('dialog', { name: 'Engineering: шинэ төсөл' });
    fireEvent.change(within(form).getByLabelText('Төслийн нэр'), { target: { value: 'Infra' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Төсөл үүсгэх' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent(
      'Алдаа гарлаа. Дахин оролдоно уу.',
    );
  });

  it('creates a sprint from the project options menu', async () => {
    const posted: unknown[] = [];
    api({
      [`POST /api/v1/projects/${PROJECT_ID}/sprints`]: (init) => {
        posted.push(body(init));
        return Response.json(
          {
            ...PROJECT_WITH_STATUSES.activeSprint,
            id: '01890000-0000-7000-8000-000000000031',
            number: 2,
          },
          { status: 201 },
        );
      },
    });
    renderAt(`/p/${PROJECT_ID}/list`);

    fireEvent.click(await screen.findByRole('button', { name: 'Төслийн сонголтууд' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Шинэ спринт' }));
    const dialog = await screen.findByRole('dialog', { name: 'Шинэ спринт' });
    const start = within(dialog).getByLabelText('Эхлэх');
    const end = within(dialog).getByLabelText('Дуусах');
    // After Sprint 1 (Oct 6 – Oct 24: 14 working days).
    expect(start).toHaveValue('2026-10-26');
    expect(end).toHaveValue('2026-11-12');
    expect(within(dialog).getByLabelText('Нэр (заавал биш)')).toHaveAttribute(
      'placeholder',
      '2-р спринт',
    );

    const create = within(dialog).getByRole('button', { name: 'Спринт үүсгэх' });
    fireEvent.change(end, { target: { value: '2026-10-20' } });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Дуусах огноо эхлэх огнооноос өмнө байж болохгүй',
    );
    expect(create).toBeDisabled();

    fireEvent.change(end, { target: { value: '2026-11-06' } });
    fireEvent.click(create);
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Шинэ спринт' })).toBeNull();
    });
    expect(posted).toEqual([{ startDate: '2026-10-26', endDate: '2026-11-06' }]);
  });
  it('archives a project from its options menu, with Undo', async () => {
    useToastStore.setState({ toasts: [] });
    const calls: string[] = [];
    const archivedAt = '2026-10-08T03:00:00.000Z';
    api({
      [`POST /api/v1/projects/${PROJECT_ID}/archive`]: () => {
        calls.push('archive');
        return Response.json({ ...PROJECT_WITH_STATUSES, archivedAt });
      },
      [`POST /api/v1/projects/${PROJECT_ID}/unarchive`]: () => {
        calls.push('unarchive');
        return Response.json(PROJECT_WITH_STATUSES);
      },
    });
    const router = renderAt(`/p/${PROJECT_ID}/list`);

    fireEvent.click(await screen.findByRole('button', { name: 'Төслийн сонголтууд' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Төслийг архивлах' }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/s/${SPACE_ID}/list`);
    });
    const [toast] = toasts();
    expect(toast?.message).toBe('App Redesign архивлагдлаа');
    toast?.action?.onClick();
    await waitFor(() => {
      expect(calls).toEqual(['archive', 'unarchive']);
    });
  });

  it('hides archive and space delete from members', async () => {
    api({ 'GET /api/v1/auth/me': asMember });
    const router = renderAt(`/p/${PROJECT_ID}/list`);

    fireEvent.click(await screen.findByRole('button', { name: 'Төслийн сонголтууд' }));
    await screen.findByRole('menuitem', { name: 'Шинэ спринт' });
    expect(screen.queryByRole('menuitem', { name: 'Төслийг архивлах' })).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await act(() => router.navigate(`/s/${SPACE_ID}/list`));
    fireEvent.click(await screen.findByRole('button', { name: 'Орон зайн сонголтууд' }));
    await screen.findByRole('menuitem', { name: 'Холбоос хуулах' });
    expect(screen.queryByRole('menuitem', { name: 'Орон зайг устгах' })).toBeNull();
  });

  it('shows a banner with Restore on an archived project', async () => {
    const calls: string[] = [];
    api({
      [`GET /api/v1/projects/${PROJECT_ID}`]: () =>
        Response.json({
          ...PROJECT_WITH_STATUSES,
          archivedAt: calls.length ? null : '2026-10-06T03:00:00.000Z',
        }),
      [`POST /api/v1/projects/${PROJECT_ID}/unarchive`]: () => {
        calls.push('unarchive');
        return Response.json(PROJECT_WITH_STATUSES);
      },
    });
    renderAt(`/p/${PROJECT_ID}/list`);

    expect(
      await screen.findByText(
        'Энэ төсөл архивлагдсан. Хажуугийн цэс, хайлт, Миний ажлууд болон тайланд харагдахгүй.',
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Төслийг сэргээх' }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Төслийг сэргээх' })).toBeNull();
    });
    expect(calls).toEqual(['unarchive']);
  });

  it('deletes a space after confirming', async () => {
    useToastStore.setState({ toasts: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const deleted: string[] = [];
    api({
      [`DELETE /api/v1/spaces/${SPACE_ID}`]: () => {
        deleted.push(SPACE_ID);
        return new Response(null, { status: 204 });
      },
    });
    const router = renderAt(`/s/${SPACE_ID}/list`);

    fireEvent.click(await screen.findByRole('button', { name: 'Орон зайн сонголтууд' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Орон зайг устгах' }));
    expect(confirm).toHaveBeenCalledWith('«Product» орон зайг устгах уу? Буцаах боломжгүй.');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/my-tasks');
    });
    expect(deleted).toEqual([SPACE_ID]);
    expect(toasts().map((x) => x.message)).toEqual(['Product устгагдлаа']);
  });

  it('keeps a space that still has projects, and asks before deleting', async () => {
    useToastStore.setState({ toasts: [] });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const fetchMock = api({
      [`DELETE /api/v1/spaces/${SPACE_ID}`]: () =>
        Response.json(
          { error: { code: 'SPACE_NOT_EMPTY', message: 'Move or delete its projects first' } },
          { status: 409 },
        ),
    });
    const router = renderAt(`/s/${SPACE_ID}/list`);
    const openDelete = async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Орон зайн сонголтууд' }));
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Орон зайг устгах' }));
    };
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

    await openDelete();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(deletes()).toHaveLength(0);

    await openDelete();
    await waitFor(() => {
      expect(toasts().map((x) => x.message)).toEqual([
        'Энэ орон зайд төсөл (архивласан ч гэсэн) байна. Эхлээд тэдгээрийг өөр орон зай руу шилжүүлнэ үү.',
      ]);
    });
    expect(deletes()).toHaveLength(1);
    expect(router.state.location.pathname).toBe(`/s/${SPACE_ID}/list`);
  });
});
