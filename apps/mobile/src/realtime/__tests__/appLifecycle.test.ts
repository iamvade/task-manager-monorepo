import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import { BACKGROUND_CLOSE_MS, appLifecycle } from '../appLifecycle';

function setup() {
  let onAppState: ((state: AppStateStatus) => void) | undefined;
  const removeApp = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    onAppState = handler;
    return { remove: removeApp };
  });
  const unsubscribeNet = jest.fn();
  jest.mocked(NetInfo.addEventListener).mockImplementation(() => unsubscribeNet);
  const resume = jest.fn();
  const suspend = jest.fn();
  const stop = appLifecycle({ resume, suspend });
  const net = jest.mocked(NetInfo.addEventListener).mock.calls.at(-1)?.[0];
  const appState = (state: AppStateStatus) => {
    onAppState?.(state);
  };
  const network = (isConnected: boolean) => {
    net?.({ isConnected, isInternetReachable: isConnected } as Parameters<
      NonNullable<typeof net>
    >[0]);
  };
  return { resume, suspend, stop, appState, network, removeApp, unsubscribeNet };
}

describe('appLifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps the socket through a quick app switch', () => {
    const s = setup();
    s.appState('background');
    jest.advanceTimersByTime(BACKGROUND_CLOSE_MS - 1);
    s.appState('active');
    jest.advanceTimersByTime(BACKGROUND_CLOSE_MS);
    expect(s.suspend).not.toHaveBeenCalled();
    expect(s.resume).toHaveBeenCalledTimes(1);
  });

  it('closes after 30 s in the background and reconnects in the foreground', () => {
    const s = setup();
    s.appState('inactive');
    s.appState('background');
    jest.advanceTimersByTime(BACKGROUND_CLOSE_MS);
    expect(s.suspend).toHaveBeenCalledTimes(1);
    s.appState('active');
    expect(s.resume).toHaveBeenCalledTimes(1);
  });

  it('replaces the connection after a long suspension, even if no timer fired', () => {
    const s = setup();
    s.appState('background');
    // iOS froze the app: the timer never ran, but the clock moved on.
    jest.setSystemTime(Date.now() + 10 * 60_000);
    s.appState('active');
    expect(s.suspend).toHaveBeenCalledTimes(1);
    expect(s.resume).toHaveBeenCalledTimes(1);
    expect(s.suspend.mock.invocationCallOrder[0]).toBeLessThan(
      s.resume.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('reconnects when the network comes back, only in the foreground', () => {
    const s = setup();
    s.network(false);
    expect(s.resume).not.toHaveBeenCalled();
    s.network(true);
    expect(s.resume).toHaveBeenCalledTimes(1);
    s.appState('background');
    s.network(true);
    expect(s.resume).toHaveBeenCalledTimes(1);
  });

  it('stops listening', () => {
    const s = setup();
    s.appState('background');
    s.stop();
    jest.advanceTimersByTime(BACKGROUND_CLOSE_MS);
    expect(s.suspend).not.toHaveBeenCalled();
    expect(s.removeApp).toHaveBeenCalled();
    expect(s.unsubscribeNet).toHaveBeenCalled();
  });
});
