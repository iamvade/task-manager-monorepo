import NetInfo from '@react-native-community/netinfo';
import type { RealtimeLifecycle } from '@kite/shared/client';
import { AppState } from 'react-native';
import { isOnline } from '../api/lifecycle';

/** In the background this long, the socket closes (I'm no longer "online" to teammates). */
export const BACKGROUND_CLOSE_MS = 30_000;

/**
 * The app's side of the realtime socket. Background → close after BACKGROUND_CLOSE_MS (a quick
 * app switch keeps it). Foreground → reconnect; after a longer absence the old connection is
 * replaced even if it looks open, since iOS suspends the app (and its timers) in the background
 * and the socket may be dead. Network back while in the foreground → reconnect now.
 */
export const appLifecycle: RealtimeLifecycle = ({ resume, suspend }) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let backgroundSince: number | null = null;
  let foreground = AppState.currentState !== 'background';

  const app = AppState.addEventListener('change', (state) => {
    foreground = state !== 'background';
    if (state === 'active') {
      clearTimeout(timer);
      timer = undefined;
      const away = backgroundSince === null ? 0 : Date.now() - backgroundSince;
      backgroundSince = null;
      if (away >= BACKGROUND_CLOSE_MS) suspend();
      resume();
    } else if (state === 'background' && backgroundSince === null) {
      backgroundSince = Date.now();
      timer = setTimeout(() => {
        timer = undefined;
        suspend();
      }, BACKGROUND_CLOSE_MS);
    }
  });
  const unsubscribeNet = NetInfo.addEventListener((state) => {
    if (isOnline(state) && foreground) resume();
  });

  return () => {
    clearTimeout(timer);
    app.remove();
    unsubscribeNet();
  };
};
