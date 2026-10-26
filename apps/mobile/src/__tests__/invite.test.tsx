import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import i18n from '../i18n';
import { currentToken } from '../api/session';
import { LABS_ID, ME_TWO, TOKEN, apiError, json, mockApi, resetApp } from '../test/app';

const INVITE = 'Abc_def-0123456789ghijklmnopqrstuvwxyzABCDE';
const preview = (accountExists: boolean) => ({
  workspace: { id: LABS_ID, name: 'Kite Labs', slug: 'kite-labs' },
  email: 'new@kite.test',
  role: 'member',
  expiresAt: '2026-11-01T00:00:00.000Z',
  accountExists,
});

describe('accept invite', () => {
  beforeEach(async () => {
    await resetApp();
    await i18n.changeLanguage('en');
  });

  it('creates the account as the app and lands in the joined workspace', async () => {
    let body: unknown;
    mockApi({
      [`GET /invites/${INVITE}`]: () => json(preview(false)),
      [`POST /invites/${INVITE}/accept`]: (init) => {
        body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
        return json({
          ...ME_TWO,
          preferences: { ...ME_TWO.preferences, locale: 'en' },
          session: { token: TOKEN, expiresAt: '2026-11-25T00:00:00.000Z' },
        });
      },
      'GET /me/notifications/unread-counts': () => json([]),
    });
    await renderRouter('src/app', { initialUrl: `/invite/${INVITE}` });
    expect(await screen.findByText('Join Kite Labs')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Full name'), 'New Person');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'password123');
    await fireEvent.changeText(screen.getByLabelText('Confirm password'), 'password123');
    await fireEvent.press(screen.getByRole('button', { name: 'Create account and join' }));
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-labs/my-tasks');
    });
    expect(body).toMatchObject({ name: 'New Person', password: 'password123', client: 'mobile' });
    expect(currentToken()).toBe(TOKEN);
  });

  it('says when the link is no longer valid', async () => {
    mockApi({ [`GET /invites/${INVITE}`]: () => apiError(404, 'INVITE_INVALID') });
    await renderRouter('src/app', { initialUrl: `/invite/${INVITE}` });
    expect(await screen.findByText("This invite isn't valid")).toBeTruthy();
  });
});
