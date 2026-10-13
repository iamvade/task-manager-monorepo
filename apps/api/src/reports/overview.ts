import {
  AGING_DEFAULT_LIMIT,
  STALE_DAYS,
  THROUGHPUT_WEEKS,
  addDays,
  reportRange,
  startOfWeek,
  type AgingTask,
  type OverviewReport,
  type OverviewReportQuery,
  type ReportQuery,
} from '@kite/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { loadHistory, scopeDto, taskInScope, type ReportContext } from './scope.js';
import {
  cycleDays,
  dayStart,
  daysBetweenTs,
  isoTs,
  localDate,
  median1,
  p85,
  rows,
  sizePoints,
} from './sql.js';
import { reportTaskColumns, reportTaskJoins, toReportTask, type ReportTaskRow } from './tasks.js';

/** Days-in-status threshold of an open period's category, per STALE_DAYS. */
const staleThreshold = (category: string) =>
  sql.raw(
    `(case ${category} ${Object.entries(STALE_DAYS)
      .map(([c, d]) => `when '${c}' then ${d}`)
      .join(' ')} else null end)`,
  );

export interface PeriodBounds {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  /** timestamptz bounds: previous start ≤ previous < current start ≤ current < current end. */
  prevStart: SQL;
  curStart: SQL;
  curEnd: SQL;
}

export function periodBounds(
  ctx: ReportContext,
  query: { period: ReportQuery['period']; from?: string | undefined; to?: string | undefined },
): PeriodBounds {
  const { range, previousRange } = reportRange(query.period, ctx.today, query);
  return {
    range,
    previousRange,
    prevStart: dayStart(previousRange.from, ctx.timezone),
    curStart: dayStart(range.from, ctx.timezone),
    curEnd: dayStart(addDays(range.to, 1), ctx.timezone),
  };
}

/**
 * Completed tasks in the current and previous period (`bucket` cur/prev): count, points,
 * unsized, cycle-time median/p85 and on-time counts. `extra` narrows the tasks (People).
 */
export const completedStatsQuery = (
  ctx: ReportContext,
  b: PeriodBounds,
  extra: SQL = sql`true`,
) => sql`
  with c as (
    select
      case when t.completed_at >= ${b.curStart} then 'cur' else 'prev' end as bucket,
      t.size, t.due_date, ${sizePoints('t')} as pts, ${cycleDays('t')} as cycle,
      ${localDate(sql`t.completed_at`, ctx.timezone)} as done_on
    from tasks t
    where ${taskInScope(ctx, 't')}
      and t.completed_at >= ${b.prevStart} and t.completed_at < ${b.curEnd}
      and ${extra}
  )
  select bucket,
    count(*)::int as count,
    coalesce(sum(pts), 0)::int as points,
    (count(*) filter (where size is null))::int as unsized,
    ${median1(sql`cycle`)} as cycle_median,
    ${p85(sql`cycle`)} as cycle_p85,
    (count(*) filter (where due_date is not null and done_on <= due_date))::int as on_time,
    (count(*) filter (where due_date is not null))::int as with_due
  from c group by bucket`;

export interface CompletedStatsRow extends Record<string, unknown> {
  bucket: 'cur' | 'prev';
  count: number;
  points: number;
  unsized: number;
  cycle_median: number | null;
  cycle_p85: number | null;
  on_time: number;
  with_due: number;
}

/** Splits completedStatsQuery rows into the response's current/previous blocks. */
export function completedBlocks(statRows: CompletedStatsRow[]) {
  const pick = (bucket: 'cur' | 'prev') => {
    const r = statRows.find((x) => x.bucket === bucket);
    return {
      completed: { count: r?.count ?? 0, points: r?.points ?? 0, unsized: r?.unsized ?? 0 },
      cycleTime: {
        median: r?.cycle_median ?? null,
        p85: r?.cycle_p85 ?? null,
        count: r?.count ?? 0,
      },
      onTime: { onTime: r?.on_time ?? 0, total: r?.with_due ?? 0 },
    };
  };
  const cur = pick('cur');
  const prev = pick('prev');
  return {
    completed: { current: cur.completed, previous: prev.completed },
    cycleTime: { current: cur.cycleTime, previous: prev.cycleTime },
    onTime: { current: cur.onTime, previous: prev.onTime },
  };
}

/** Open tasks due before today; `extra` narrows them (People). */
export const overdueQuery = (ctx: ReportContext, extra: SQL = sql`true`) => sql`
  select count(*)::int as count, max(${ctx.today}::date - t.due_date)::int as oldest
  from tasks t
  where ${taskInScope(ctx, 't')} and t.completed_at is null
    and t.due_date < ${ctx.today}::date and ${extra}`;

/** Monday of the first week in the 24-week throughput window (12 shown + 12 previous). */
export const throughputStart = (today: string) =>
  addDays(startOfWeek(today), -7 * (THROUGHPUT_WEEKS * 2 - 1));

const throughputQuery = (ctx: ReportContext) => {
  const first = throughputStart(ctx.today);
  return sql`
    with c as (
      select date_trunc('week', t.completed_at at time zone ${ctx.timezone})::date as week_start,
        count(*)::int as n
      from tasks t
      where ${taskInScope(ctx, 't')} and t.completed_at >= ${dayStart(first, ctx.timezone)}
      group by 1
    )
    select w.week_start::text as week_start, coalesce(c.n, 0)::int as count
    from generate_series(${first}::date, ${startOfWeek(ctx.today)}::date, interval '7 days') as g(d)
    cross join lateral (select g.d::date as week_start) w
    left join c on c.week_start = w.week_start
    order by w.week_start`;
};

const waitsQuery = (ctx: ReportContext, b: PeriodBounds) => sql`
  select sp.category,
    ${median1(daysBetweenTs(sql`sp.entered_at`, sql`sp.exited_at`))} as median,
    count(*)::int as periods
  from task_status_periods sp
  join tasks t on t.id = sp.task_id
  where ${taskInScope(ctx, 't')} and sp.category <> 'done'
    and sp.exited_at >= ${b.curStart} and sp.exited_at < ${b.curEnd}
  group by sp.category`;

/** Open tasks with how long they've been in their current status. */
const openPeriods = (ctx: ReportContext) => sql`
  select t.id, sp.entered_at, sp.category,
    (${ctx.today}::date - ${localDate(sql`sp.entered_at`, ctx.timezone)})::int as days
  from tasks t
  join task_status_periods sp on sp.task_id = t.id and sp.exited_at is null
  where ${taskInScope(ctx, 't')} and t.completed_at is null`;

const agingCountsQuery = (ctx: ReportContext) => sql`
  select count(*)::int as total,
    (count(*) filter (where o.days > ${staleThreshold('o.category')}))::int as stale
  from (${openPeriods(ctx)}) o`;

/** The longest-waiting open tasks (all of them without `limit`: the CSV). */
export const agingTasksQuery = (ctx: ReportContext, limit: number | null) => sql`
  select ${reportTaskColumns}, ${isoTs(sql`o.entered_at`)} as entered_at, o.days,
    (o.days > ${staleThreshold('o.category')}) as stale
  from (${openPeriods(ctx)}) o
  join tasks t on t.id = o.id
  ${reportTaskJoins}
  order by o.days desc, o.entered_at asc, t.id
  ${limit === null ? sql`` : sql`limit ${limit}`}`;

interface AgingRow extends ReportTaskRow {
  entered_at: string;
  days: number;
  stale: boolean;
}

export const toAgingTask = (r: AgingRow): AgingTask => ({
  ...toReportTask(r),
  enteredAt: r.entered_at,
  daysInStatus: r.days,
  stale: r.stale,
});

export async function loadAgingTasks(db: DbOrTx, ctx: ReportContext, limit: number | null) {
  return (await rows<AgingRow>(db, agingTasksQuery(ctx, limit))).map(toAgingTask);
}

/** Every query of the Overview, by name (the perf script EXPLAINs them). */
export function overviewQueries(
  ctx: ReportContext,
  b: PeriodBounds,
  agingLimit: number | null = AGING_DEFAULT_LIMIT,
) {
  return {
    completed: completedStatsQuery(ctx, b),
    overdue: overdueQuery(ctx),
    throughput: throughputQuery(ctx),
    waits: waitsQuery(ctx, b),
    agingCounts: agingCountsQuery(ctx),
    agingTasks: agingTasksQuery(ctx, agingLimit),
  };
}

export async function buildOverview(
  db: DbOrTx,
  ctx: ReportContext,
  query: OverviewReportQuery,
): Promise<Omit<OverviewReport, 'generatedAt'>> {
  const b = periodBounds(ctx, query);
  const limit = query.agingLimit ?? AGING_DEFAULT_LIMIT;
  const q = overviewQueries(ctx, b, limit === 'all' ? null : limit);
  const [history, stats, overdue, weeks, waits, agingCounts, agingTasks] = await Promise.all([
    loadHistory(db, ctx),
    rows<CompletedStatsRow>(db, q.completed),
    rows<{ count: number; oldest: number | null }>(db, q.overdue),
    rows<{ week_start: string; count: number }>(db, q.throughput),
    rows<{ category: 'todo' | 'in_progress' | 'review'; median: number | null; periods: number }>(
      db,
      q.waits,
    ),
    rows<{ total: number; stale: number }>(db, q.agingCounts),
    rows<AgingRow>(db, q.agingTasks),
  ]);

  const thisWeek = startOfWeek(ctx.today);
  const series = weeks.map((w) => ({
    weekStart: w.week_start,
    count: w.count,
    partial: w.week_start === thisWeek,
  }));

  return {
    today: ctx.today,
    timezone: ctx.timezone,
    scope: scopeDto(ctx),
    history,
    range: b.range,
    previousRange: b.previousRange,
    ...completedBlocks(stats),
    overdue: { count: overdue[0]?.count ?? 0, oldestDaysLate: overdue[0]?.oldest ?? null },
    throughput: {
      weeks: series.slice(THROUGHPUT_WEEKS),
      // A workspace younger than the window has no previous period to compare with: omit the
      // series rather than draw twelve zeros.
      previous: series.slice(0, THROUGHPUT_WEEKS).some((w) => w.count > 0)
        ? series.slice(0, THROUGHPUT_WEEKS)
        : [],
    },
    waits: (['todo', 'in_progress', 'review'] as const).map((category) => {
      const w = waits.find((x) => x.category === category);
      return { category, medianDays: w?.median ?? null, periods: w?.periods ?? 0 };
    }),
    aging: {
      total: agingCounts[0]?.total ?? 0,
      staleCount: agingCounts[0]?.stale ?? 0,
      tasks: agingTasks.map(toAgingTask),
    },
  };
}
