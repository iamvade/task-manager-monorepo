import { addDays, daysBetween, startOfWeek, todayInZone, type Locale } from '@kite/shared';
import { format, parseISO } from 'date-fns';

export const DEFAULT_TIMEZONE = 'Asia/Ulaanbaatar';

/** How a due date is colored (docs/design-notes.md 2.2 "Due tone"). */
export type DueTone = 'overdue' | 'today' | 'soon' | 'later' | 'done';

/**
 * overdue < today · today · soon = tomorrow → Sunday of the current Mon–Sun week (tomorrow is
 * always soon, even on Sunday) · later · done when the task is complete.
 */
export function dueTone(date: string, today: string, done = false): DueTone {
  if (done) return 'done';
  const diff = daysBetween(today, date);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff === 1) return 'soon';
  const sunday = addDays(startOfWeek(today), 6);
  return date <= sunday ? 'soon' : 'later';
}

/** Text color (+ weight) per tone; tokens switch for dark mode. */
export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: 'text-due-overdue font-medium',
  today: 'text-due-today font-medium',
  soon: 'text-due-soon',
  later: 'text-due-later',
  done: 'text-due-done',
};

/** `today` / `tomorrow` / `yesterday` relative to `today`, else null. */
export function relativeDay(
  date: string,
  today: string,
): 'today' | 'tomorrow' | 'yesterday' | null {
  const diff = daysBetween(today, date);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  return null;
}

function parts(date: string) {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  return { y, m, d };
}

/**
 * "Oct 14" / "10-р сарын 14". The year is added when it differs from today's:
 * "Oct 14, 2027" / "2027 оны 10-р сарын 14".
 */
export function formatDate(date: string, locale: Locale, today: string): string {
  const { y, m, d } = parts(date);
  const withYear = y !== parts(today).y;
  if (locale === 'mn') return `${withYear ? `${y} оны ` : ''}${m}-р сарын ${d}`;
  return format(parseISO(date), withYear ? 'MMM d, yyyy' : 'MMM d');
}

/**
 * Inclusive date range: "Oct 6 – Oct 24" / "10-р сарын 6 – 24" (Mongolian drops the repeated
 * month); across months "Sep 29 – Oct 3" / "9-р сарын 29 – 10-р сарын 3".
 */
export function formatRange(start: string, end: string, locale: Locale, today: string): string {
  const a = parts(start);
  const b = parts(end);
  if (locale === 'mn' && a.y === b.y && a.m === b.m) {
    return `${formatDate(start, locale, today)} – ${b.d}`;
  }
  return `${formatDate(start, locale, today)} – ${formatDate(end, locale, today)}`;
}

/** Today's date in the user's time zone (falls back to Asia/Ulaanbaatar for unknown zones). */
export function todayFor(timeZone: string | undefined, now: Date = new Date()): string {
  try {
    return todayInZone(timeZone ?? DEFAULT_TIMEZONE, now);
  } catch {
    return todayInZone(DEFAULT_TIMEZONE, now);
  }
}
