import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import i18n from '../i18n';
import { leaveTo } from '../lib/leaveTo';
import { createQueryClient } from '../queryClient';
import { routes } from '../router';
import { ME, mockApi } from '../test/fixtures';

vi.mock('../lib/leaveTo', () => ({ leaveTo: vi.fn() }));

const ME_EN = { ...ME, preferences: { ...ME.preferences, locale: 'en' } };
const CLIENT = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const QUERY = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT,
  redirect_uri: REDIRECT,
  code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  code_challenge_method: 'S256',
  state: 'st-1',
  resource: 'http://localhost:3000/mcp',
}).toString();

type Handlers = Parameters<typeof mockApi>[0];

function renderConsent(handlers: Handlers, search = `?${QUERY}`) {
  const fetchMock = mockApi({
    'GET /api/v1/auth/me': () => Response.json(ME_EN),
    'POST /api/v1/oauth/authorize/check': () =>
      Response.json({ clientName: 'Claude', redirectHost: 'claude.ai' }),
    ...handlers,
  });
  const router = createMemoryRouter(routes, { initialEntries: [`/oauth/authorize${search}`] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { fetchMock, router };
}

const bodyOf = (init?: RequestInit) =>
  JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<string, unknown>;

describe('OAuth consent page', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(leaveTo).mockClear();
    await i18n.changeLanguage('en');
  });

  it('says who is asking, as whom, and what it can do', async () => {
    renderConsent({});
    expect(await screen.findByRole('heading', { name: 'Connect Claude to Kite?' })).toBeVisible();
    expect(screen.getByText(`Signed in as ${ME.user.name} (${ME.user.email}).`)).toBeVisible();
    expect(screen.getByText(/It can’t delete anything/)).toBeVisible();
    expect(screen.getByText(/you’ll go back to claude\.ai/)).toBeVisible();
  });

  it('Allow sends the request as it came and leaves for the returned address', async () => {
    let sent: Record<string, unknown> | undefined;
    renderConsent({
      'POST /api/v1/oauth/authorize': (init) => {
        sent = bodyOf(init);
        return Response.json({ redirectTo: `${REDIRECT}?code=abc&state=st-1` });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }));
    await waitFor(() => {
      expect(leaveTo).toHaveBeenCalledWith(`${REDIRECT}?code=abc&state=st-1`);
    });
    expect(sent).toMatchObject({
      approve: true,
      clientId: CLIENT,
      redirectUri: REDIRECT,
      responseType: 'code',
      codeChallengeMethod: 'S256',
      state: 'st-1',
    });
    // Still busy: the browser is leaving.
    expect(screen.getByRole('button', { name: 'Allow' })).toBeDisabled();
  });

  it('Cancel reports the refusal to the app', async () => {
    let sent: Record<string, unknown> | undefined;
    renderConsent({
      'POST /api/v1/oauth/authorize': (init) => {
        sent = bodyOf(init);
        return Response.json({ redirectTo: `${REDIRECT}?error=access_denied&state=st-1` });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(leaveTo).toHaveBeenCalledWith(`${REDIRECT}?error=access_denied&state=st-1`);
    });
    expect(sent).toMatchObject({ approve: false });
  });

  it('shows an error and never leaves when the app is not allowed', async () => {
    renderConsent({
      'POST /api/v1/oauth/authorize/check': () =>
        Response.json({ error: { code: 'OAUTH_INVALID_CLIENT', message: 'no' } }, { status: 400 }),
    });
    expect(await screen.findByText('This app isn’t allowed to connect to Kite.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Allow' })).not.toBeInTheDocument();
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it('shows an error for a link without a client or return address', async () => {
    const { fetchMock } = renderConsent({}, '?response_type=code');
    expect(await screen.findByText('This request can’t be completed')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/oauth/')),
    ).toBe(false);
  });

  it('sends a signed-out person to sign in and back', async () => {
    const { router } = renderConsent({
      'GET /api/v1/auth/me': () =>
        Response.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
    });
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
    expect(new URLSearchParams(router.state.location.search).get('next')).toBe(
      `/oauth/authorize?${QUERY}`,
    );
  });

  it('refuses the platform admin without asking the server', async () => {
    const { fetchMock } = renderConsent({
      'GET /api/v1/auth/me': () =>
        Response.json({ ...ME_EN, user: { ...ME_EN.user, platformRole: 'vade' }, workspaces: [] }),
    });
    expect(await screen.findByText('Not available for this account')).toBeVisible();
    expect(
      fetchMock.mock.calls.some(([url]) => typeof url === 'string' && url.includes('/oauth/')),
    ).toBe(false);
  });
});
