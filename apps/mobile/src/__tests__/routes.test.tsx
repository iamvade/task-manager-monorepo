import { ME, WORKSPACE_ID } from '@kite/shared/testing';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import i18n from '../i18n';
import { currentToken } from '../api/session';
import {
  LABS_ID,
  ME_TWO,
  TOKEN,
  apiError,
  json,
  mockApi,
  resetApp,
  savedUiState,
  signedInSession,
} from '../test/app';

// Fonts load instantly in tests (expo-font is mocked by jest-expo).
const APP_DIR = 'src/app';

const signedIn = (me = ME_TWO) => {
  mockApi({
    'GET /auth/me': () => json(me),
    'GET /me/notifications/unread-counts': () => json([]),
  });
  return signedInSession();
};

describe('routes', () => {
  beforeEach(async () => {
    await resetApp();
    await i18n.changeLanguage('mn');
  });

  it('opens sign-in from / without a session (and asks the server nothing)', async () => {
    const fetch = mockApi({});
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText('Kite-д нэвтрэх')).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the first workspace when signed in', async () => {
    await signedIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-studio/my-tasks');
    });
    for (const label of ['Миний ажил', 'Төслүүд', 'Мэдэгдэл', 'Стэндап', 'Бусад']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("opens the workspace this account used last (another account's choice doesn't count)", async () => {
    savedUiState(ME.user.id, LABS_ID);
    savedUiState('01890000-0000-7000-8000-0000000000ff', WORKSPACE_ID);
    await signedIn();
    await renderRouter(APP_DIR, { initialUrl: '/' });
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-labs/my-tasks');
    });
  });

  it('sends a workspace slug that is not mine home', async () => {
    await signedIn();
    await renderRouter(APP_DIR, { initialUrl: '/w/someone-else/inbox' });
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-studio/my-tasks');
    });
  });

  it('shows "No workspace yet" for an account in none', async () => {
    await signedIn({ ...ME_TWO, workspaces: [] });
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText('Ажлын орчин алга')).toBeTruthy();
    expect(screen).toHavePathname('/no-workspace');
  });

  it('signs out when the server says the session is over', async () => {
    await signedInSession();
    mockApi({ 'GET /auth/me': () => apiError(401, 'UNAUTHORIZED') });
    await renderRouter(APP_DIR, { initialUrl: '/w/kite-studio/my-tasks' });
    await waitFor(() => {
      expect(screen).toHavePathname('/sign-in');
    });
    expect(currentToken()).toBeNull();
  });

  it('signs in with the app session and lands in the workspace', async () => {
    await i18n.changeLanguage('en');
    let body: unknown;
    mockApi({
      'POST /auth/login': (init) => {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return json({
          ...ME_TWO,
          session: { token: TOKEN, expiresAt: '2026-11-25T00:00:00.000Z' },
        });
      },
      'GET /me/notifications/unread-counts': () => json([]),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), 'anu@kite.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-studio/my-tasks');
    });
    expect(body).toMatchObject({
      email: 'anu@kite.test',
      password: 'password123',
      client: 'mobile',
    });
    expect(currentToken()).toBe(TOKEN);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'kite.session',
      expect.stringContaining(TOKEN),
      expect.anything(),
    );
  });

  it('shows a wrong password inline and the lockout countdown', async () => {
    await i18n.changeLanguage('en');
    let attempts = 0;
    mockApi({
      'POST /auth/login': () =>
        ++attempts === 1
          ? apiError(401, 'INVALID_CREDENTIALS')
          : apiError(429, 'RATE_LIMITED', { 'Retry-After': '299' }),
    });
    await renderRouter(APP_DIR, { initialUrl: '/sign-in' });
    await fireEvent.changeText(await screen.findByLabelText('Email'), 'anu@kite.test');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'nope');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password.')).toBeTruthy();
    expect(screen).toHavePathname('/sign-in');

    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Too many attempts')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /Try again in 4:5\d/ })).toBeDisabled();
  });

  it('follows the language', async () => {
    await i18n.changeLanguage('en');
    await signedIn({ ...ME_TWO, preferences: { ...ME_TWO.preferences, locale: 'en' } });
    await renderRouter(APP_DIR, { initialUrl: '/w/kite-studio/inbox' });
    expect((await screen.findAllByText('Inbox')).length).toBeGreaterThan(0);
  });

  it('shows not found for unknown paths', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/nope' });
    expect(await screen.findByText('Олдсонгүй')).toBeTruthy();
  });
});
