import { addDays, type Locale } from '@kite/shared';
import { todayFor } from './dates';

/**
 * How long ago a timestamp was, in the user's time zone (TaskDetail.dc.html activity times):
 * under a minute → just now · earlier today → minutes / hours ago · yesterday → "Yesterday,
 * 4:12 PM" · older → the date ("Oct 1").
 */
export type RelativeTime =
  | { kind: 'justNow' }
  | { kind: 'minutes'; count: number }
  | { kind: 'hours'; count: number }
  | { kind: 'yesterday'; time: string }
  | { kind: 'date'; date: string };

/** "4:12 PM" (en) / "16:12" (mn) in `timeZone`. */
export function formatTime(at: Date, timeZone: string | undefined, locale: Locale): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: locale === 'en',
  };
  try {
    return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'en-GB', {
      ...options,
      timeZone,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-US', options).format(at);
  }
}

export function relativeTime(
  iso: string,
  now: Date,
  timeZone: string | undefined,
  locale: Locale,
): RelativeTime {
  const at = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - at.getTime()) / 1000);
  const day = todayFor(timeZone, at);
  const today = todayFor(timeZone, now);
  if (seconds < 60) return { kind: 'justNow' };
  if (day === today) {
    const minutes = Math.floor(seconds / 60);
    return minutes < 60
      ? { kind: 'minutes', count: minutes }
      : { kind: 'hours', count: Math.floor(minutes / 60) };
  }
  if (day === addDays(today, -1)) {
    return { kind: 'yesterday', time: formatTime(at, timeZone, locale) };
  }
  return { kind: 'date', date: day };
}

/** "248 KB" style sizes (1 KB = 1024 B; KB rounded, MB with one decimal under 10). */
export function fileSize(bytes: number): { unit: 'b' | 'kb' | 'mb'; value: string } {
  if (bytes < 1024) return { unit: 'b', value: String(bytes) };
  const kb = bytes / 1024;
  if (kb < 1024) return { unit: 'kb', value: String(Math.max(1, Math.round(kb))) };
  const mb = kb / 1024;
  return {
    unit: 'mb',
    value: mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : String(Math.round(mb)),
  };
}
