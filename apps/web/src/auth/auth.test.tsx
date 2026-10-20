import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { ME, SIDEBAR, WORKSPACE_ID, mockApi, unauthorized } from '../test/fixtures';
import { homeHandlers } from '../test/home';
import { AuthProvider } from './AuthProvider';

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

describe('auth flow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('mn');
  });

  it('redirects a signed-out visitor to /login, keeping the target', async () => {
    mockApi({ 'GET /api/v1/auth/me': unauthorized });
    const router = renderAt('/w/kite-studio/my-tasks');

    expect(await screen.findByRole('heading', { name: 'Kite-д нэвтрэх' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fw%2Fkite-studio%2Fmy-tasks');
  });

  it('offers Try again when the server is unreachable, instead of the sign-in page', async () => {
    let down = true;
    mockApi({
      'GET /api/v1/auth/me': () => {
        if (down) throw new TypeError('Failed to fetch');
        return Response.json(ME);
      },
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
      ...homeHandlers(),
    });
    const router = renderAt('/w/kite-studio/my-tasks');

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервертэй холбогдож чадсангүй');
    expect(router.state.location.pathname).toBe('/w/kite-studio/my-tasks');

    down = false;
    fireEvent.click(screen.getByRole('button', { name: 'Дахин оролдох' }));
    expect(await screen.findByRole('navigation', { name: 'Ажлын орчин' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the platform admin on /admin and everyone else out of it', async () => {
    const vade = { ...ME, user: { ...ME.user, platformRole: 'vade' as const }, workspaces: [] };
    mockApi({
      'GET /api/v1/auth/me': () => Response.json(vade),
      'GET /api/v1/admin/workspaces': () => Response.json([]),
    });
    const router = renderAt('/w/kite-studio/my-tasks');
    expect(await screen.findByRole('heading', { name: 'Ажлын орчнууд' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin');
    expect(await screen.findByText('Ажлын орчин алга байна.')).toBeInTheDocument();
  });

  it('sends a workspace member away from /admin', async () => {
    mockApi({
      'GET /api/v1/auth/me': () => Response.json(ME),
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
      ...homeHandlers(),
    });
    const router = renderAt('/admin');
    expect(await screen.findByRole('navigation', { name: 'Ажлын орчин' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/w/kite-studio/my-tasks');
  });

  it('shows the generic error on bad credentials', async () => {
    mockApi({
      'GET /api/v1/auth/me': unauthorized,
      'POST /api/v1/auth/login': () =>
        Response.json(
          { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } },
          { status: 401 },
        ),
    });
    renderAt('/login');

    fireEvent.change(await screen.findByLabelText('Имэйл'), {
      target: { value: 'anu@kite.test' },
    });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэвтрэх' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Имэйл эсвэл нууц үг буруу байна.');
  });

  it('shows how long to wait when the login throttle answers 429', async () => {
    mockApi({
      'GET /api/v1/auth/me': unauthorized,
      'POST /api/v1/auth/login': () =>
        Response.json(
          { error: { code: 'RATE_LIMITED', message: 'Too many sign-in attempts' } },
          { status: 429, headers: { 'Retry-After': '51' } },
        ),
    });
    renderAt('/login');

    fireEvent.change(await screen.findByLabelText('Имэйл'), {
      target: { value: 'anu@kite.test' },
    });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэвтрэх' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Хэт олон оролдлого. 51 секундын дараа дахин оролдоно уу.',
    );
  });

  it('signs in and lands on the requested page', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/auth/me': unauthorized,
      'POST /api/v1/auth/login': () => Response.json(ME),
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
      ...homeHandlers(),
    });
    const router = renderAt('/login?next=%2Fmy-tasks');

    fireEvent.change(await screen.findByLabelText('Имэйл'), {
      target: { value: ' anu@kite.test ' },
    });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэвтрэх' }));

    // Retry until the page settles: the shell can re-render right after the redirect.
    await waitFor(() => {
      // My Tasks greets by first name ("Өглөөний мэнд, Anu", by time of day).
      expect(screen.getByRole('heading', { level: 1, name: /мэнд, Anu$/ })).toBeInTheDocument();
    });
    expect(router.state.location.pathname).toBe('/w/kite-studio/my-tasks');
    const loginCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(loginCall?.[1]?.body as string)).toEqual({
      email: 'anu@kite.test',
      password: 'password123',
    });
  });

  it('switches the sign-in page to English', async () => {
    mockApi({ 'GET /api/v1/auth/me': unauthorized });
    renderAt('/login');

    fireEvent.click(await screen.findByRole('radio', { name: 'EN' }));
    expect(await screen.findByRole('heading', { name: 'Sign in to Kite' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'EN' })).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => {
      expect(document.documentElement.lang).toBe('en');
    });
  });
});
