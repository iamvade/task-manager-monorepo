import { DEFAULT_TIMEZONE } from '../../lib/dates';

/** Hour of `now` (0–23) in `timeZone`. */
export function hourIn(timeZone: string | undefined, now: Date = new Date()): number {
  const hour = (zone: string) =>
    Number(
      new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        hourCycle: 'h23',
        timeZone: zone,
      }).format(now),
    );
  try {
    return hour(timeZone ?? DEFAULT_TIMEZONE);
  } catch {
    return hour(DEFAULT_TIMEZONE);
  }
}

/** 5–11 morning · 12–17 afternoon · otherwise evening. */
export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}
