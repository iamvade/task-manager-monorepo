import { queryKeys } from '@kite/shared/client';
import { FakeWebSocket } from '@kite/shared/testing';
import { act, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { queryClient } from '../../api/queryClient';
import { currentToken } from '../../api/session';
import { ME_TWO, json, mockApi, resetApp, signedInSession } from '../../test/app';

// Its own file: a fourth renderRouter of the app in one test file never mounts (fake timers).

describe('RealtimeProvider sign-out', () => {
  beforeEach(async () => {
    await resetApp();
  });

  it('signs out when the server closes the socket for an ended session (4401)', async () => {
    await signedInSession();
    mockApi({
      'GET /auth/me': () => json(ME_TWO),
      'GET /me/notifications/unread-counts': () => json([]),
    });
    await renderRouter('src/app', { initialUrl: '/w/kite-studio/my-tasks' });
    await waitFor(() => {
      jest.advanceTimersByTime(20);
      expect(FakeWebSocket.last?.readyState).toBe(FakeWebSocket.OPEN);
    });
    const ws = FakeWebSocket.last;
    if (!ws) throw new Error('no socket');
    await act(async () => {
      ws.drop(4401);
      // signOut() runs on: let it finish inside act.
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen).toHavePathname('/sign-in');
    });
    expect(currentToken()).toBeNull();
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
    // Signed out: the socket is closed for good.
    await waitFor(() => {
      expect(FakeWebSocket.last?.readyState).toBe(FakeWebSocket.CLOSED);
    });
  });
});
