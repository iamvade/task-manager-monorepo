import {
  MENTION_REPLY_DAYS,
  THROUGHPUT_WEEKS,
  addDays,
  startOfWeek,
  type PaletteKey,
  type PersonReport,
  type PersonReportQuery,
  type WorkspaceRole,
} from '@kite/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { httpError } from '../errors.js';
import {
  completedBlocks,
  completedStatsQuery,
  overdueQuery,
  periodBounds,
  type CompletedStatsRow,
  type PeriodBounds,
} from './overview.js';
import { loadHistory, scopeDto, taskInScope, type ReportContext } from './scope.js';
import { alias, cycleDays, dayStart, daysBetweenTs, median1, rows } from './sql.js';
import { reportTaskColumns, reportTaskJoins, toReportTask, type ReportTaskRow } from './tasks.js';

/**
 * Whether `user` was assigned to completed task `t` when it was completed: the first
 * assignee change for them after `completed_at` tells (a removal means they were, an addition
 * that they weren't); without one, the current assignment does.
 */
const assignedAtCompletion = (t: string, user: SQL) => {
  const a = alias(t);
  return sql`coalesce((
    select ac.type = 'assignee.removed' from activity ac
    where ac.task_id = ${a}.id and ac.type in ('assignee.added', 'assignee.removed')
      and ac.payload -> 'user' ->> 'id' = (${user})::text and ac.created_at > ${a}.completed_at
    order by ac.created_at, ac.id limit 1
  ), exists (select 1 from task_assignees aac where aac.task_id = ${a}.id and aac.user_id = ${user}))`;
};

/** The person's completions: candidate tasks (assigned now, or ever in the log), then the check. */
const creditedTo = (ctx: ReportContext, t: string, userId: string) => sql`
  ${alias(t)}.id in (
    select ta.task_id from task_assignees ta where ta.user_id = ${userId}
    union
    select ac.task_id from activity ac
    where ac.workspace_id = ${ctx.workspaceId} and ac.type in ('assignee.added', 'assignee.removed')
      and ac.payload -> 'user' ->> 'id' = ${userId}
  ) and ${assignedAtCompletion(t, sql`${userId}::uuid`)}`;

const isAssignee = (t: string, userId: string) =>
  sql`exists (select 1 from task_assignees ia where ia.task_id = ${alias(t)}.id and ia.user_id = ${userId})`;

const bucketOf = (ts: SQL, b: PeriodBounds) =>
  sql`case when ${ts} >= ${b.curStart} then 'cur' else 'prev' end`;

const reviewsQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  select ${bucketOf(sql`sp.exited_at`, b)} as bucket,
    ${median1(daysBetweenTs(sql`sp.entered_at`, sql`sp.exited_at`))} as median,
    count(*)::int as count
  from task_status_periods sp
  join tasks t on t.id = sp.task_id
  where ${taskInScope(ctx, 't')} and sp.category = 'review'
    and sp.exited_at >= ${b.prevStart} and sp.exited_at < ${b.curEnd}
    and coalesce(t.reviewer_id, sp.exited_by) = ${userId}
  group by 1`;

/** Monday of the first of the 12 trend weeks. */
const trendStart = (today: string) => addDays(startOfWeek(today), -7 * (THROUGHPUT_WEEKS - 1));

/** Every completion of the last 12 weeks with the people it is credited to (team medians). */
const teamCredits = (ctx: ReportContext) => sql`
  select t.id, t.completed_at, u.user_id, ${cycleDays('t')} as cycle
  from tasks t
  cross join lateral (
    select ta.user_id from task_assignees ta where ta.task_id = t.id
    union
    select (ac.payload -> 'user' ->> 'id')::uuid from activity ac
    where ac.task_id = t.id and ac.type in ('assignee.added', 'assignee.removed')
      and ac.created_at > t.completed_at
  ) u
  where ${taskInScope(ctx, 't')}
    and t.completed_at >= ${dayStart(trendStart(ctx.today), ctx.timezone)}
    and ${assignedAtCompletion('t', sql`u.user_id`)}
    and u.user_id in (select user_id from workspace_members where workspace_id = ${ctx.workspaceId})`;

const trendQuery = (ctx: ReportContext, userId: string) => {
  const first = trendStart(ctx.today);
  return sql`
    with mine as (
      select date_trunc('week', t.completed_at at time zone ${ctx.timezone})::date as week_start,
        ${cycleDays('t')} as cycle
      from tasks t
      where ${taskInScope(ctx, 't')}
        and t.completed_at >= ${dayStart(first, ctx.timezone)}
        and ${creditedTo(ctx, 't', userId)}
    )
    select g.d::date::text as week_start,
      count(mine.cycle)::int as completed,
      ${median1(sql`mine.cycle`)} as cycle_median
    from generate_series(${first}::date, ${startOfWeek(ctx.today)}::date, interval '7 days') as g(d)
    left join mine on mine.week_start = g.d::date
    group by g.d order by g.d`;
};

const teamQuery = (ctx: ReportContext) => sql`
  with c as (${teamCredits(ctx)}),
  per_member as (select user_id, count(*)::float8 / ${THROUGHPUT_WEEKS} as weekly from c group by user_id),
  per_task as (select distinct on (id) id, cycle from c)
  select
    (select round((percentile_cont(0.5) within group (order by weekly))::numeric, 1)::float8
      from per_member) as completed_median,
    (select ${median1(sql`cycle`)} from per_task) as cycle_median`;

const commentsQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  select ${bucketOf(sql`c.created_at`, b)} as bucket, count(*)::int as count
  from comments c
  join tasks t on t.id = c.task_id
  where c.author_id = ${userId} and c.deleted_at is null
    and c.created_at >= ${b.prevStart} and c.created_at < ${b.curEnd}
    and ${taskInScope(ctx, 't')} and not ${isAssignee('t', userId)}
  group by 1`;

const subtasksQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  select count(*)::int as count, count(distinct ac.task_id)::int as tasks
  from activity ac
  join tasks t on t.id = ac.task_id
  where ac.workspace_id = ${ctx.workspaceId} and ac.type = 'subtask.completed'
    and ac.actor_id = ${userId}
    and ac.created_at >= ${b.curStart} and ac.created_at < ${b.curEnd}
    and ${taskInScope(ctx, 't')} and not ${isAssignee('t', userId)}`;

/** Comments by others mentioning the person, and the person's first comment within 7 days. */
const mentionsQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  with m as (
    select c.id, c.task_id, c.created_at
    from comments c
    join tasks t on t.id = c.task_id
    where c.author_id <> ${userId} and c.deleted_at is null
      and c.created_at >= ${b.curStart} and c.created_at < ${b.curEnd}
      and ${taskInScope(ctx, 't')}
      and jsonb_path_exists(c.body, '$.** ? (@.type == "mention" && @.attrs.id == $uid)',
        jsonb_build_object('uid', ${userId}::text))
  ),
  r as (
    select m.created_at, (
      select min(rc.created_at) from comments rc
      where rc.task_id = m.task_id and rc.author_id = ${userId} and rc.deleted_at is null
        and rc.created_at > m.created_at
        and rc.created_at <= m.created_at + make_interval(days => ${MENTION_REPLY_DAYS})
    ) as replied_at
    from m
  )
  select count(*)::int as total, count(replied_at)::int as answered,
    ${median1(sql`extract(epoch from replied_at - created_at) / 3600.0`, sql`replied_at is not null`)} as median_hours
  from r`;

/**
 * Helping contributions in the period in both directions (the person on others' tasks and
 * others on the person's tasks): comments and checked-off subtasks by someone not assigned to
 * the task, credited to each assignee. Top 3 people.
 */
const workedWithQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  with contrib as (
    select c.author_id as actor, c.task_id
    from comments c join tasks t on t.id = c.task_id
    where c.deleted_at is null and c.created_at >= ${b.curStart} and c.created_at < ${b.curEnd}
      and ${taskInScope(ctx, 't')}
      and (c.author_id = ${userId} or ${isAssignee('t', userId)})
    union all
    select ac.actor_id, ac.task_id
    from activity ac join tasks t on t.id = ac.task_id
    where ac.workspace_id = ${ctx.workspaceId} and ac.type = 'subtask.completed'
      and ac.created_at >= ${b.curStart} and ac.created_at < ${b.curEnd}
      and ${taskInScope(ctx, 't')}
      and (ac.actor_id = ${userId} or ${isAssignee('t', userId)})
  ),
  helping as (
    select k.actor as helper, ta.user_id as owner
    from contrib k join task_assignees ta on ta.task_id = k.task_id
    where ta.user_id <> k.actor
      and not exists (select 1 from task_assignees x where x.task_id = k.task_id and x.user_id = k.actor)
  ),
  other as (
    select owner as user_id from helping where helper = ${userId}
    union all
    select helper from helping where owner = ${userId}
  )
  select u.id, u.name, u.initials, u.avatar_color, count(*)::int as count
  from other o
  join workspace_members wm on wm.user_id = o.user_id and wm.workspace_id = ${ctx.workspaceId}
  join users u on u.id = o.user_id
  where o.user_id <> ${userId}
  group by u.id, u.name, u.initials, u.avatar_color
  order by count desc, u.name, u.id
  limit 3`;

const openTasksQuery = (ctx: ReportContext, userId: string) => sql`
  select ${reportTaskColumns}
  from tasks t
  ${reportTaskJoins}
  where ${taskInScope(ctx, 't')} and t.completed_at is null and ${isAssignee('t', userId)}
  order by t.due_date nulls last, p.key, t.number`;

/** The person's completed tasks in the period (the CSV, "Export my data"). */
export const completedTasksQuery = (ctx: ReportContext, b: PeriodBounds, userId: string) => sql`
  select ${reportTaskColumns},
    to_char(t.completed_at at time zone ${ctx.timezone}, 'YYYY-MM-DD HH24:MI') as completed_local,
    round((${cycleDays('t')})::numeric, 1)::float8 as cycle
  from tasks t
  ${reportTaskJoins}
  where ${taskInScope(ctx, 't')}
    and t.completed_at >= ${b.curStart} and t.completed_at < ${b.curEnd}
    and ${creditedTo(ctx, 't', userId)}
  order by t.completed_at, t.id`;

/** Every query of the People report (the perf script EXPLAINs them). */
export function personQueries(ctx: ReportContext, b: PeriodBounds, userId: string) {
  return {
    completed: completedStatsQuery(ctx, b, creditedTo(ctx, 't', userId)),
    overdue: overdueQuery(ctx, isAssignee('t', userId)),
    reviews: reviewsQuery(ctx, b, userId),
    trend: trendQuery(ctx, userId),
    team: teamQuery(ctx),
    comments: commentsQuery(ctx, b, userId),
    subtasks: subtasksQuery(ctx, b, userId),
    mentions: mentionsQuery(ctx, b, userId),
    workedWith: workedWithQuery(ctx, b, userId),
    openTasks: openTasksQuery(ctx, userId),
  };
}

interface PersonRow extends Record<string, unknown> {
  id: string;
  name: string;
  initials: string;
  avatar_color: PaletteKey;
  title: string | null;
  role: WorkspaceRole;
}

/** The person as a workspace member; 404 when they aren't one. */
export async function loadPerson(db: DbOrTx, workspaceId: string, userId: string) {
  const [person] = await rows<PersonRow>(
    db,
    sql`select u.id, u.name, u.initials, u.avatar_color, wm.title, wm.role
      from workspace_members wm join users u on u.id = wm.user_id
      where wm.workspace_id = ${workspaceId} and wm.user_id = ${userId}`,
  );
  if (!person) throw httpError(404, 'NOT_FOUND', 'Person not found');
  return person;
}

type Bucketed<T> = T & { bucket: 'cur' | 'prev' };

export async function buildPerson(
  db: DbOrTx,
  ctx: ReportContext,
  userId: string,
  query: PersonReportQuery,
): Promise<Omit<PersonReport, 'generatedAt'>> {
  const person = await loadPerson(db, ctx.workspaceId, userId);
  const b = periodBounds(ctx, query);
  const q = personQueries(ctx, b, userId);
  const [
    history,
    stats,
    overdue,
    reviews,
    trend,
    team,
    comments,
    subtasks,
    mentions,
    worked,
    open,
  ] = await Promise.all([
    loadHistory(db, ctx),
    rows<CompletedStatsRow>(db, q.completed),
    rows<{ count: number; oldest: number | null }>(db, q.overdue),
    rows<Bucketed<{ median: number | null; count: number }>>(db, q.reviews),
    rows<{ week_start: string; completed: number; cycle_median: number | null }>(db, q.trend),
    rows<{ completed_median: number | null; cycle_median: number | null }>(db, q.team),
    rows<Bucketed<{ count: number }>>(db, q.comments),
    rows<{ count: number; tasks: number }>(db, q.subtasks),
    rows<{ total: number; answered: number; median_hours: number | null }>(db, q.mentions),
    rows<{ id: string; name: string; initials: string; avatar_color: PaletteKey; count: number }>(
      db,
      q.workedWith,
    ),
    rows<ReportTaskRow>(db, q.openTasks),
  ]);

  const review = (bucket: 'cur' | 'prev') => {
    const r = reviews.find((x) => x.bucket === bucket);
    return { medianDays: r?.median ?? null, count: r?.count ?? 0 };
  };
  const commentCount = (bucket: 'cur' | 'prev') =>
    comments.find((x) => x.bucket === bucket)?.count ?? 0;
  const thisWeek = startOfWeek(ctx.today);
  const blocks = completedBlocks(stats);

  return {
    today: ctx.today,
    timezone: ctx.timezone,
    scope: scopeDto(ctx),
    history,
    range: b.range,
    previousRange: b.previousRange,
    person: {
      user: {
        id: person.id,
        name: person.name,
        initials: person.initials,
        avatarColor: person.avatar_color,
      },
      title: person.title,
      role: person.role,
    },
    completed: blocks.completed,
    onTime: blocks.onTime,
    cycleTime: blocks.cycleTime,
    overdue: { count: overdue[0]?.count ?? 0, oldestDaysLate: overdue[0]?.oldest ?? null },
    reviews: { current: review('cur'), previous: review('prev') },
    trends: {
      weeks: trend.map((w) => ({
        weekStart: w.week_start,
        completed: w.completed,
        cycleMedian: w.cycle_median,
        partial: w.week_start === thisWeek,
      })),
      teamCompletedMedian: team[0]?.completed_median ?? null,
      teamCycleMedian: team[0]?.cycle_median ?? null,
    },
    helping: {
      comments: { current: commentCount('cur'), previous: commentCount('prev') },
      subtasks: { count: subtasks[0]?.count ?? 0, tasks: subtasks[0]?.tasks ?? 0 },
      mentions: {
        answered: mentions[0]?.answered ?? 0,
        total: mentions[0]?.total ?? 0,
        medianReplyHours: mentions[0]?.median_hours ?? null,
      },
      workedWith: worked.map((w) => ({
        user: { id: w.id, name: w.name, initials: w.initials, avatarColor: w.avatar_color },
        count: w.count,
      })),
    },
    openTasks: open.map(toReportTask),
  };
}
