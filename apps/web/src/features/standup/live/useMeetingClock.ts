import { useEffect, useState } from 'react';

/**
 * "Now" on the server's clock, ticking every second while `running`: the timers count from the
 * server's `currentStartedAt`, so every screen in the meeting shows the same time.
 */
export function useMeetingClock(
  serverNow: string | undefined,
  fetchedAt: number,
  running: boolean,
) {
  const offset = serverNow ? Date.parse(serverNow) - fetchedAt : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [running]);
  return now + offset;
}
