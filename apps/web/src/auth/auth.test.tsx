import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { AuthProvider } from './AuthProvider';

const ME = {
  user: {
    id: '01890000-0000-7000-8000-000000000001',
    email: 'anu@kite.test',
    name: 'Anu Bold',
    initials: 'AB',
    avatarColor: 'indigo',
  },
  preferences: {
    locale: 'mn',
    timezone: 'Asia/Ulaanbaatar',
    theme: 'light',
    accent: '#6E56CF',
    density: 'comfortable',
    notificationPrefs: { mention: true, assigned: true, comment: true, status: true },
  },
  workspaces: [
    {
      id: '01890000-0000-7000-8000-000000000002',
      name: 'Kite Studio',
      slug: 'kite-studio',
      role: 'owner',
      title: null,
    },
  ],
};

const unauthorized = () =>
  Response.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, { status: 401 });

type Handler = (init?: RequestInit) => Response;

function mockApi(handlers: Record<string, Handler>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const key = `${init?.method ?? 'GET'} ${url}`;
    const handler = handlers[key];
    if (!handler) throw new Error(`Unexpected request ${key}`);
    return Promise.resolve(handler(init));
  });
}

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
    });
    const router = renderAt('/login?next=%2Fmy-tasks');

    fireEvent.change(await screen.findByLabelText('Имэйл'), {
      target: { value: ' anu@kite.test ' },
    });
    fireEvent.change(screen.getByLabelText('Нууц үг'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Нэвтрэх' }));

    expect(await screen.findByRole('heading', { name: 'Миний ажлууд' })).toBeInTheDocument();
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
