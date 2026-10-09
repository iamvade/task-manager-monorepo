import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { ME, SIDEBAR, WORKSPACE_ID, mockApi, unauthorized } from '../test/fixtures';
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
    const router = renderAt('/my-tasks');

    expect(await screen.findByRole('heading', { name: 'Kite-д нэвтрэх' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fmy-tasks');
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

  it('signs in and lands on the requested page', async () => {
    const fetchMock = mockApi({
      'GET /api/v1/auth/me': unauthorized,
      'POST /api/v1/auth/login': () => Response.json(ME),
      [`GET /api/v1/workspaces/${WORKSPACE_ID}/sidebar`]: () => Response.json(SIDEBAR),
    });
    const router = renderAt('/login?next=%2Fmy-tasks');

    fireEvent.change(await screen.findByLabelText('Имэйл'), {
      target: { value: ' anu@kite.test ' },
    });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэвтрэх' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Миний ажлууд' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/my-tasks');
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
