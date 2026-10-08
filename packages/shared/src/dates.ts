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
