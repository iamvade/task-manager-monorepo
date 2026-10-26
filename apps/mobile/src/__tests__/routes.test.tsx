import { renderRouter, screen } from 'expo-router/testing-library';
import i18n from '../i18n';

// Fonts load instantly in tests (expo-font is mocked by jest-expo).
const APP_DIR = 'src/app';

describe('routes', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('mn');
  });

  it('opens sign-in from /', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(screen).toHavePathname('/sign-in');
    expect(await screen.findByText('Kite-д нэвтрэх')).toBeTruthy();
  });

  it('shows the five tabs inside a workspace', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/w/kite-studio/my-tasks' });
    expect(screen).toHavePathname('/w/kite-studio/my-tasks');
    for (const label of ['Миний ажил', 'Төслүүд', 'Мэдэгдэл', 'Стэндап', 'Бусад']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('follows the language', async () => {
    await i18n.changeLanguage('en');
    await renderRouter(APP_DIR, { initialUrl: '/w/kite-studio/inbox' });
    expect(screen.getAllByText('Inbox').length).toBeGreaterThan(0);
  });

  it('shows not found for unknown paths', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/nope' });
    expect(await screen.findByText('Олдсонгүй')).toBeTruthy();
  });
});
