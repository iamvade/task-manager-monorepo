import { addDays, daysBetween, startOfWeek } from './dates.js';
import type { StatusCategory } from './enums.js';

/** Reports appear once a scope has this many completed tasks (all time); before that "x / 5". */
export const REPORT_MIN_COMPLETED = 5;

/** Open tasks in a status longer than this many days are flagged "Stale" (Aging tasks). */
export const STALE_DAYS: Readonly<Record<Exclude<StatusCategory, 'done'>, number>> = {
  todo: 5,
  in_progress: 5,
  review: 5,
};

/** Workload: Heavy above capacity × this factor (15 → more than 18 points). */
export const HEAVY_FACTOR = 1.2;
/** Workload: Heavy from this many overdue points, whatever the total. */
export const HEAVY_OVERDUE_POINTS = 5;
/** Sprints: a task carried over this many times is flagged "Replan". */
export const REPLAN_TIMES = 3;
/** Sprints: up to this share of committed tasks above ideal reads "slightly behind ideal". */
export const PACE_SLIGHT_SHARE = 0.15;
/** Weeks in the throughput chart and the People/My performance trends. */
export const THROUGHPUT_WEEKS = 12;
/** Mentions answered: the mentioned person must comment on the task within this many days. */
export const MENTION_REPLY_DAYS = 7;
/** Longest custom period, in days. */
export const MAX_REPORT_DAYS = 366;

export const REPORT_PERIODS = ['week', '4w', 'quarter', 'custom'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

/** Inclusive `YYYY-MM-DD` bounds. */
export interface DateRange {
  from: string;
  to: string;
}

/** First day of the calendar quarter containing `date`. */
function startOfQuarter(date: string): string {
  const [year, month] = date.split('-').map(Number) as [number, number];
  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(first).padStart(2, '0')}-01`;
}

/**
 * The period ending `today` (in the caller's time zone) and the same-length window right before
 * it. `4w` = the 28 days ending today, `week` = Monday → today, `quarter` = the calendar quarter
 * up to today, `custom` = `from`–`to`.
 */
export function reportRange(
  period: ReportPeriod,
  today: string,
  custom?: Partial<DateRange>,
): { range: DateRange; previousRange: DateRange } {
  let range: DateRange;
  switch (period) {
    case 'week':
      range = { from: startOfWeek(today), to: today };
      break;
    case 'quarter':
      range = { from: startOfQuarter(today), to: today };
      break;
    case 'custom':
      if (!custom?.from || !custom.to) throw new Error('A custom period needs from and to');
      range = { from: custom.from, to: custom.to };
      break;
    default:
      range = { from: addDays(today, -27), to: today };
  }
  const length = daysBetween(range.from, range.to) + 1;
  return {
    range,
    previousRange: { from: addDays(range.from, -length), to: addDays(range.from, -1) },
  };
}

export const WORKLOAD_LOADS = ['heavy', 'balanced', 'light'] as const;
export type WorkloadLoad = (typeof WORKLOAD_LOADS)[number];

/**
 * Heavy when open points exceed capacity × 1.2 or overdue points reach 5; Light at half the
 * capacity or less; Balanced otherwise (capacity 15 → more than 18 / at most 7).
 */
export function workloadLoad(
  points: number,
  overduePoints: number,
  capacity: number,
): WorkloadLoad {
  if (points > capacity * HEAVY_FACTOR || overduePoints >= HEAVY_OVERDUE_POINTS) return 'heavy';
  if (points <= capacity / 2) return 'light';
  return 'balanced';
}

export const SPRINT_PACES = ['on_track', 'slightly_behind', 'behind'] as const;
export type SprintPace = (typeof SPRINT_PACES)[number];

/** Remaining vs ideal today: up to 15 % of committed above ideal is "slightly behind". */
export function sprintPace(remaining: number, ideal: number, committed: number): SprintPace {
  const over = remaining - ideal;
  if (over <= 0) return 'on_track';
  return over <= committed * PACE_SLIGHT_SHARE ? 'slightly_behind' : 'behind';
}
