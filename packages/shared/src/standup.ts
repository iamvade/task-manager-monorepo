import { addDays, todayInZone, weekdayIndex } from './dates.js';

/** Weekday indexes as stored in `standup_groups.days`: Monday = 0 … Sunday = 6 (`weekdayIndex`). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Mon–Fri, the default for a new group. */
export const DEFAULT_STANDUP_DAYS: readonly number[] = [0, 1, 2, 3, 4];

/** How far `previousStandupDay` / `nextStandupDay` search before giving up. */
export const STANDUP_DAY_SEARCH = 31;

/** What the helpers need from a group. Dates are local to the group's `timezone`. */
export interface StandupSchedule {
  days: readonly number[];
  timezone: string;
}

/** The group's local date at `now`. */
export function groupToday(
  group: Pick<StandupSchedule, 'timezone'>,
  now: Date = new Date(),
): string {
  return todayInZone(group.timezone, now);
}

/** A weekday the group meets on that isn't a workspace holiday. */
export function isStandupDay(
  group: Pick<StandupSchedule, 'days'>,
  date: string,
  holidays: ReadonlySet<string> = new Set(),
): boolean {
  return group.days.includes(weekdayIndex(date)) && !holidays.has(date);
}

/** The group's standup days from `fromDate` to `toDate`, both included (group-local dates). */
export function standupDays(
  group: StandupSchedule,
  fromDate: string,
  toDate: string,
  holidays: ReadonlySet<string> = new Set(),
): string[] {
  const out: string[] = [];
  for (let day = fromDate; day <= toDate; day = addDays(day, 1)) {
    if (isStandupDay(group, day, holidays)) out.push(day);
  }
  return out;
}

/**
 * "Yesterday" for a standup on `date`: the latest standup day before it, searching at most
 * `STANDUP_DAY_SEARCH` days back. Null when there is none (no days set, or a month of holidays).
 */
export function previousStandupDay(
  group: StandupSchedule,
  date: string,
  holidays: ReadonlySet<string> = new Set(),
): string | null {
  for (let back = 1; back <= STANDUP_DAY_SEARCH; back++) {
    const day = addDays(date, -back);
    if (isStandupDay(group, day, holidays)) return day;
  }
  return null;
}

/** The first standup day after `date` (e.g. "back Oct 12" after an absence), or null. */
export function nextStandupDay(
  group: StandupSchedule,
  date: string,
  holidays: ReadonlySet<string> = new Set(),
): string | null {
  for (let ahead = 1; ahead <= STANDUP_DAY_SEARCH; ahead++) {
    const day = addDays(date, ahead);
    if (isStandupDay(group, day, holidays)) return day;
  }
  return null;
}

/** Minutes east of UTC that `timeZone` is at `instant`. */
function zoneOffsetMinutes(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

/** The instant of a wall-clock `HH:mm` on `date` in `timeZone`. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const [y = 0, mo = 1, d = 1] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  // Two passes settle DST edges: the offset at the guess, then at the corrected instant.
  let instant = new Date(guess - zoneOffsetMinutes(timeZone, new Date(guess)) * 60_000);
  instant = new Date(guess - zoneOffsetMinutes(timeZone, instant) * 60_000);
  return instant;
}

/**
 * A group time (`HH:mm` on `date` in `fromZone`) as a viewer in `toZone` sees it. Members in other
 * timezones see the schedule in their own local time.
 */
export function zonedTimeToZone(
  date: string,
  time: string,
  fromZone: string,
  toZone: string,
): { date: string; time: string } {
  const instant = zonedInstant(date, time, fromZone);
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: toZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => local.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** UTC offset label such as `UTC+8` or `UTC+5:30` for `timeZone` at `instant`. */
export function utcOffsetLabel(timeZone: string, instant: Date = new Date()): string {
  const minutes = zoneOffsetMinutes(timeZone, instant);
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}
