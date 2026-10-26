import { WORKSPACE_ID } from '@kite/shared/testing';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import i18n from '../i18n';
import { LABS_ID, ME_TWO, json, mockApi, resetApp, signedInSession } from '../test/app';

const ME_EN = { ...ME_TWO, preferences: { ...ME_TWO.preferences, locale: 'en' as const } };
const INVITE = 'Abc_def-0123456789ghijklmnopqrstuvwxyzABCDE';

async function openSwitcher(from = '/w/kite-studio/inbox') {
  await signedInSession();
  mockApi({
    'GET /auth/me': () => json(ME_EN),
    'GET /me/notifications/unread-counts': () =>
      json([
        { workspaceId: WORKSPACE_ID, unread: 3 },
        { workspaceId: LABS_ID, unread: 12 },
      ]),
    [`GET /invites/${INVITE}`]: () =>
      json({
        workspace: { id: LABS_ID, name: 'Kite Labs', slug: 'kite-labs' },
        email: 'anu@kite.test',
        role: 'member',
        expiresAt: '2026-11-01T00:00:00.000Z',
        accountExists: true,
      }),
  });
  await renderRouter('src/app', {
    initialUrl: `/w/kite-studio/switcher?from=${encodeURIComponent(from)}`,
  });
  await screen.findByText('Workspaces');
}

describe('workspace switcher', () => {
  beforeEach(async () => {
    await resetApp();
    await i18n.changeLanguage('en');
  });

  it('lists my workspaces with roles and unread counts (9+), the current one checked', async () => {
    await openSwitcher();
    const studio = await screen.findByRole('button', { name: /^Kite Studio, Owner/ });
    expect(studio.props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole('button', { name: /^Kite Studio, Owner, 3 unread/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Kite Labs, Member, 12 unread/ })).toBeTruthy();
    expect(screen.getByText('9+')).toBeTruthy();
    expect(screen.getByText('Sign out of anu@kite.test')).toBeTruthy();
  });

  it('switching keeps the section', async () => {
    await openSwitcher('/w/kite-studio/inbox');
    await fireEvent.press(await screen.findByRole('button', { name: /^Kite Labs/ }));
    await waitFor(() => {
      expect(screen).toHavePathname('/w/kite-labs/inbox');
    });
  });

  it('opens a pasted invite link, and says when it isn’t one', async () => {
    await openSwitcher();
    const field = screen.getByLabelText('Join with an invite link');
    await fireEvent.changeText(field, 'not a link');
    await fireEvent.press(screen.getByRole('button', { name: 'Open invite' }));
    expect(await screen.findByText('That doesn’t look like an invite link.')).toBeTruthy();

    await fireEvent.changeText(field, `https://tasks.kite.mn/invite/${INVITE}`);
    await fireEvent.press(screen.getByRole('button', { name: 'Open invite' }));
    await waitFor(() => {
      expect(screen).toHavePathname(`/invite/${INVITE}`);
    });
    expect(await screen.findByText('Join workspace')).toBeTruthy();
  });
});
