/**
 * The designs are drawn on Thursday 2026-10-08. The seed shifts every design date by the same number
 * of days so "today", "tomorrow" and "overdue" stay right whenever it runs.
 */
const DAY_MS = 86_400_000;
const DESIGN_YEAR = 2026;
const DESIGN_TODAY_UTC = Date.UTC(DESIGN_YEAR, 9, 8);
/** Asia/Ulaanbaatar is UTC+8 with no DST. */
const UB_OFFSET_MS = 8 * 3_600_000;

/** Month and day as drawn in the designs, e.g. `[10, 14]` = Oct 14. */
export type MonthDay = readonly [month: number, day: number];
/** A design date plus a local Ulaanbaatar time, e.g. `[10, 7, '16:12']`. */
export type Stamp = readonly [month: number, day: number, time: string];
/** A design timestamp, or "N hours ago" relative to when the seed runs. */
export type When = Stamp | { readonly hoursAgo: number };

export interface Clock {
  /** Today in Ulaanbaatar, `YYYY-MM-DD`. */
  today: string;
  now: Date;
  /** Shifted design date as `YYYY-MM-DD`. */
  day: (md: MonthDay) => string;
  /** Shifted design timestamp, or `now - hoursAgo`. */
  at: (when: When) => Date;
  /** Start of yesterday in Ulaanbaatar. */
  startOfYesterday: Date;
}

const ubDateString = (instant: Date) =>
  new Date(instant.getTime() + UB_OFFSET_MS).toISOString().slice(0, 10);

/** `todayOverride` (`YYYY-MM-DD`) pins "today", e.g. to 2026-10-08 for a 1:1 match with the designs. */
export function createClock(todayOverride?: string, realNow = new Date()): Clock {
  const today = todayOverride ?? ubDateString(realNow);
  const todayUtc = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(todayUtc)) throw new Error(`Invalid seed date: ${today}`);
  const shiftDays = Math.round((todayUtc - DESIGN_TODAY_UTC) / DAY_MS);

  // Keep the real time of day so "2 hours ago" stays on the pinned day.
  const timeOfDay = (realNow.getTime() + UB_OFFSET_MS) % DAY_MS;
  const now = new Date(todayUtc + timeOfDay - UB_OFFSET_MS);

  const localMidnight = (month: number, dayOfMonth: number) =>
    Date.UTC(DESIGN_YEAR, month - 1, dayOfMonth + shiftDays) - UB_OFFSET_MS;

  return {
    today,
    now,
    day: ([month, dayOfMonth]) =>
      new Date(Date.UTC(DESIGN_YEAR, month - 1, dayOfMonth + shiftDays)).toISOString().slice(0, 10),
    at: (when) => {
      if ('hoursAgo' in when) return new Date(now.getTime() - when.hoursAgo * 3_600_000);
      const [month, dayOfMonth, time] = when;
      const [hours = 0, minutes = 0] = time.split(':').map(Number);
      return new Date(localMidnight(month, dayOfMonth) + (hours * 60 + minutes) * 60_000);
    },
    startOfYesterday: new Date(todayUtc - DAY_MS - UB_OFFSET_MS),
  };
}
