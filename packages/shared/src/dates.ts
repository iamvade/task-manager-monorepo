import { z } from 'zod';

/** A calendar date without time, `YYYY-MM-DD` (due/start dates, sprint bounds). */
export const dateSchema = z.iso.date();

/** Today's date in an IANA time zone, `YYYY-MM-DD`. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYY-MM-DD` shifted by `days` (calendar arithmetic, no time zones involved). */
export function addDays(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${date}`);
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** Day of the week of a `YYYY-MM-DD` date, Monday = 0 … Sunday = 6. */
export function weekdayIndex(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid date: ${date}`);
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/** The Monday of the Mon–Sun week containing `date`. */
export function startOfWeek(date: string): string {
  return addDays(date, -weekdayIndex(date));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`Invalid date: ${from} / ${to}`);
  return Math.round((b - a) / 86_400_000);
}
