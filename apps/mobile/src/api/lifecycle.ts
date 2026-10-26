import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { AppState } from 'react-native';

/** Online unless the OS says otherwise (`null` = not known yet). */
export function isOnline(state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>) {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * React Query's "window focus" is the app in the foreground, "online" the network: offline,
 * queries and mutations pause and pick up again on reconnect.
 */
export function wireQueryLifecycle() {
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (state) => {
      setFocused(state === 'active');
    });
    return () => {
      sub.remove();
    };
  });
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      setOnline(isOnline(state));
    }),
  );
}
