import { useEffect, useState } from 'react';

/** Seconds left until `until` (ms timestamp), ticking each second; 0 once passed or unset. */
export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time >= until) clearInterval(id);
    };
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [until]);
  return until === null ? 0 : Math.max(0, Math.ceil((until - now) / 1000));
}

/** `4:59` */
export function clockLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}
