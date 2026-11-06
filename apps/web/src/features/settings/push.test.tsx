import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createQueryClient } from '../../queryClient';
import { useToastStore } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { mockApi } from '../../test/fixtures';
import { PushSection } from './PushSection';

const browser = vi.hoisted(() => ({
  pushSupport: vi.fn(() => 'supported'),
  notificationPermission: vi.fn(() => 'default'),
  subscribeBrowser: vi.fn(),
  unsubscribeBrowser: vi.fn(),
  currentSubscription: vi.fn(),
}));
vi.mock('../../push/browser', () => browser);

const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'p', auth: 'a' },
};

function renderPush(
  config: { enabled: boolean; publicKey: string | null } = { enabled: true, publicKey: 'BKey' },
) {
  const fetchMock = mockApi({
    'GET /api/v1/push/config': () => Response.json(config),
    'PUT /api/v1/me/push-subscriptions': () => new Response(null, { status: 204 }),
    'DELETE /api/v1/me/push-subscriptions': () => new Response(null, { status: 204 }),
  });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <PushSection />
    </QueryClientProvider>,
  );
  return fetchMock;
}

const sent = (fetchMock: ReturnType<typeof mockApi>, method: string) =>
  fetchMock.mock.calls
    .filter(([, init]) => init?.method === method)
    .map(([, init]) => JSON.parse(init?.body as string) as unknown);

describe('Settings → Notifications → This device', () => {
  beforeEach(async () => {
    localStorage.clear();
    useUiStore.setState({ pushOptIn: false });
    useToastStore.setState({ toasts: [] });
    browser.pushSupport.mockReturnValue('supported');
    browser.notificationPermission.mockReturnValue('default');
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes this browser and saves it when switched on', async () => {
    browser.subscribeBrowser.mockImplementation(() => {
      browser.notificationPermission.mockReturnValue('granted');
      return Promise.resolve(SUBSCRIPTION);
    });
    const fetchMock = renderPush();
    const toggle = await screen.findByRole('switch', { name: /Push notifications/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });
    expect(browser.subscribeBrowser).toHaveBeenCalledWith('BKey');
    expect(sent(fetchMock, 'PUT')).toEqual([SUBSCRIPTION]);
    expect(useUiStore.getState().pushOptIn).toBe(true);
  });

  it('stays off and says why when the permission prompt is dismissed', async () => {
    browser.subscribeBrowser.mockResolvedValue(null);
    const fetchMock = renderPush();
    fireEvent.click(await screen.findByRole('switch', { name: /Push notifications/ }));
    await waitFor(() => {
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual([
        'Notifications weren’t allowed, so push stays off.',
      ]);
    });
    expect(sent(fetchMock, 'PUT')).toEqual([]);
    expect(screen.getByRole('switch', { name: /Push notifications/ })).not.toBeChecked();
  });

  it('unsubscribes and tells the server when switched off', async () => {
    useUiStore.setState({ pushOptIn: true });
    browser.notificationPermission.mockReturnValue('granted');
    browser.unsubscribeBrowser.mockResolvedValue(SUBSCRIPTION.endpoint);
    const fetchMock = renderPush();
    const toggle = await screen.findByRole('switch', { name: /Push notifications/ });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).not.toBeChecked();
    });
    expect(sent(fetchMock, 'DELETE')).toEqual([{ endpoint: SUBSCRIPTION.endpoint }]);
  });

  it.each([
    ['insecure', 'Needs a secure (https) connection.'],
    ['iosInstall', 'add Kite to your Home Screen'],
    ['unsupported', 'This browser can’t receive push notifications.'],
  ])('explains why push can’t work here (%s) with the switch disabled', async (support, text) => {
    browser.pushSupport.mockReturnValue(support);
    renderPush();
    const toggle = await screen.findByRole('switch', { name: /Push notifications/ });
    expect(toggle).toBeDisabled();
    expect(screen.getByText(new RegExp(text.replace(/[()]/g, '\\$&')))).toBeInTheDocument();
  });

  it('points to the browser settings when notifications are blocked', async () => {
    browser.notificationPermission.mockReturnValue('denied');
    renderPush();
    expect(await screen.findByRole('switch', { name: /Push notifications/ })).toBeDisabled();
    expect(screen.getByText(/Notifications are blocked for this site/)).toBeInTheDocument();
  });

  it('is hidden when the server has no VAPID keys', async () => {
    const fetchMock = renderPush({ enabled: false, publicKey: null });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    // Let the query settle, then nothing is shown.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
