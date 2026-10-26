import {
  REPLAN_TIMES,
  addDays,
  isWorkingDay,
  sprintPace,
  type CarriedTask,
  type PaletteKey,
  type ReportSprintRef,
  type SprintDetail,
  type SprintsReport,
  type WaitCategory,
} from '@kite/shared';
import { eq, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { workspaceHolidays } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { loadHistory, scopeDto, scopedProjectIds, type ReportContext } from './scope.js';
import { closedAt, dayStart, doneAt, isoTs, rows, textArray, waitCategoriesSql } from './sql.js';
import { reportTaskColumns, reportTaskJoins, toReportTask, type ReportTaskRow } from './tasks.js';

const RECENT_SPRINTS = 6;

interface SprintRow extends Record<string, unknown> {
  id: string;
  number: number;
  name: string | null;
  start_date: string;
  end_date: string;
  /** Its non-archived projects in the scope. */
  project_ids: string[];
}

/** Condition: sprint task row `t` belongs to a project in scope (shared sprints span projects). */
const inScope = (ctx: ReportContext, t: string) =>
  sql`${sql.raw(t)}.project_id in ${scopedProjectIds(ctx)}`;

/** Working days of a sprint, in order. */
function workingDays(start: string, end: string, holidays: ReadonlySet<string>): string[] {
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isWorkingDay(d, holidays)) days.push(d);
  return days;
}

/** Sprint end as an instant: midnight after its last day. */
const sprintEndSql = (alias: string, timezone: string) =>
  sql`((${sql.raw(alias)}.end_date + 1)::timestamp at time zone ${timezone})`;

/** Sprint start as an instant: midnight at the start of its first day. */
const sprintStartSql = (alias: string, timezone: string) =>
  sql`(${sql.raw(alias)}.start_date::timestamp at time zone ${timezone})`;

/**
 * When a membership stopped counting for its sprint: when it was removed, or the sprint's end
 * if it was still open then (moves on the last day happen before midnight, so `removed_at`
 * is the earlier instant).
 */
const membershipLeftSql = (m: string, sprintAlias: string, timezone: string) =>
  sql`least(coalesce(${sql.raw(m)}.removed_at, 'infinity'::timestamptz), ${sprintEndSql(sprintAlias, timezone)})`;

/**
 * Each sprint's numbers for the scope's tasks, as of `at[i]`: committed (open at the start),
 * added after the start, and members done at the cutoff (end of sprint, or now).
 */
const totalsQuery = (ctx: ReportContext, ids: string[], starts: string[], cutoffs: string[]) => sql`
  select x.id::text as id,
    (select count(distinct sm.task_id) from sprint_memberships sm
      join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
      where sm.sprint_id = x.id and sm.added_at <= x.start_at
        and (sm.removed_at is null or sm.removed_at > x.start_at))::int as committed,
    (select count(distinct sm.task_id) from sprint_memberships sm
      join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
      where sm.sprint_id = x.id and sm.added_at > x.start_at and sm.added_at <= x.cutoff)::int as added,
    (select count(distinct sm.task_id) from sprint_memberships sm
      join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
      where sm.sprint_id = x.id and sm.added_at <= x.cutoff
        and (sm.removed_at is null or sm.removed_at >= x.cutoff)
        and ${doneAt('t', sql`x.cutoff`)})::int as completed
  from unnest(${textArray(ids)}::uuid[], ${textArray(starts)}::timestamptz[], ${textArray(cutoffs)}::timestamptz[])
    as x(id, start_at, cutoff)`;

/** Open sprint tasks at each burndown point, and tasks added since the previous point. */
const burndownQuery = (ctx: ReportContext, sprintId: string, startIso: string, ats: string[]) => {
  const prevs = ats.map((_, i) => ats[Math.max(0, i - 1)] ?? startIso);
  return sql`
    with m as (
      select sm.task_id, sm.added_at, sm.removed_at from sprint_memberships sm
      join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
      where sm.sprint_id = ${sprintId}
    )
    select x.idx::int as idx,
      (select count(distinct m.task_id) from m join tasks t on t.id = m.task_id
        where m.added_at <= x.at and (m.removed_at is null or m.removed_at > x.at)
          and not ${closedAt('t', sql`x.at`)})::int as remaining,
      (select count(distinct m.task_id) from m
        where m.added_at > greatest(x.prev_at, ${startIso}::timestamptz)
          and m.added_at <= x.at)::int as added
    from unnest(${textArray(ats)}::timestamptz[], ${textArray(prevs)}::timestamptz[]) with ordinality as x(at, prev_at, idx)
    order by x.idx`;
};

/**
 * Tasks in sprint `n`'s scope (committed or added by the cutoff) that left sprint `prev`
 * unfinished: not done when their membership there ended, or at the sprint's end if it was
 * still open then. `times` = how many of the `earlier` sprints (the related ones before `n`)
 * the task left that way.
 * A task moved to the next sprint on the last afternoon, or after the next one started, counts
 * (`setSprint` closes and opens memberships at the same instant, so "open at the end" never
 * matches a replan done inside a sprint).
 */
export const carriedQuery = (
  ctx: ReportContext,
  sprint: SprintRow,
  prev: SprintRow,
  earlier: readonly SprintRow[],
  cutoffIso: string,
) => {
  const startAt = dayStart(sprint.start_date, ctx.timezone);
  return sql`
    with members as (
      select distinct sm.task_id from sprint_memberships sm
      join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
      where sm.sprint_id = ${sprint.id}
        and ((sm.added_at <= ${startAt} and (sm.removed_at is null or sm.removed_at > ${startAt}))
          or (sm.added_at > ${startAt} and sm.added_at <= ${cutoffIso}::timestamptz))
    ),
    unfinished as (
      -- (task, earlier sprint) pairs where the task was in the sprint and left it open.
      select em.task_id, es.id as sprint_id
      from sprint_memberships em
      join sprints es on es.id = em.sprint_id
      join tasks et on et.id = em.task_id
      where em.task_id in (select task_id from members)
        and es.id = any(${textArray(earlier.map((e) => e.id))}::uuid[])
        and em.added_at < ${sprintEndSql('es', ctx.timezone)}
        and (em.removed_at is null or em.removed_at > ${sprintStartSql('es', ctx.timezone)})
        and not ${closedAt('et', membershipLeftSql('em', 'es', ctx.timezone))}
    ),
    carried as (
      select task_id, count(distinct sprint_id)::int as times from unfinished
      group by task_id
      having bool_or(sprint_id = ${prev.id})
    )
    select ${reportTaskColumns}, c.times
    from carried c
    join tasks t on t.id = c.task_id
    ${reportTaskJoins}
    order by c.times desc, p.key, t.number`;
};

/** Past sprint: tasks that left it unfinished (see `carriedQuery`) and are or were in the next. */
const carriedOutQuery = (ctx: ReportContext, sprint: SprintRow, next: SprintRow) => {
  const startAt = dayStart(sprint.start_date, ctx.timezone);
  const endAt = dayStart(addDays(sprint.end_date, 1), ctx.timezone);
  return sql`
    select count(distinct sm.task_id)::int as n from sprint_memberships sm
    join tasks t on t.id = sm.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
    where sm.sprint_id = ${sprint.id} and sm.added_at < ${endAt}
      and (sm.removed_at is null or sm.removed_at > ${startAt})
      and not ${closedAt('t', sql`least(coalesce(sm.removed_at, 'infinity'::timestamptz), ${endAt})`)}
      and exists (select 1 from sprint_memberships nm
        where nm.task_id = sm.task_id and nm.sprint_id = ${next.id})`;
};

/**
 * Current sprint: the status category its open tasks have waited longest in, by the median
 * time in their current (open) status period.
 */
const waitingQuery = (ctx: ReportContext, sprintId: string, nowIso: string) => sql`
  select tsp.category
  from sprint_memberships sm
  join tasks t on t.id = sm.task_id and t.deleted_at is null and t.closed_at is null
    and ${inScope(ctx, 't')}
  join task_status_periods tsp on tsp.task_id = t.id and tsp.exited_at is null
  where sm.sprint_id = ${sprintId} and sm.removed_at is null
    and tsp.category in (${waitCategoriesSql})
  group by tsp.category
  order by percentile_cont(0.5) within group (
    order by extract(epoch from ${nowIso}::timestamptz - tsp.entered_at)) desc,
    tsp.category
  limit 1`;

export type CarriedRow = ReportTaskRow & { times: number };

/** Every scoped task of a sprint (committed or added) with its flags at the cutoff (the CSV). */
export const sprintTasksQuery = (
  ctx: ReportContext,
  sprintId: string,
  startIso: string,
  cutoffIso: string,
) => sql`
  with mem as (
    select sm.task_id,
      bool_or(sm.added_at <= ${startIso}::timestamptz
        and (sm.removed_at is null or sm.removed_at > ${startIso}::timestamptz)) as committed,
      bool_or(sm.added_at > ${startIso}::timestamptz
        and sm.added_at <= ${cutoffIso}::timestamptz) as added
    from sprint_memberships sm
    where sm.sprint_id = ${sprintId}
    group by sm.task_id
  )
  select ${reportTaskColumns}, mem.committed, mem.added,
    ${doneAt('t', sql`${cutoffIso}::timestamptz`)} as done
  from mem
  join tasks t on t.id = mem.task_id and t.deleted_at is null and ${inScope(ctx, 't')}
  ${reportTaskJoins}
  where mem.committed or mem.added
  order by p.key, t.number`;

export type SprintTaskRow = ReportTaskRow & { committed: boolean; added: boolean; done: boolean };

export const toCarried = (r: CarriedRow): CarriedTask => ({
  ...toReportTask(r),
  timesCarried: r.times,
  replan: r.times >= REPLAN_TIMES,
});

interface ProjectRef {
  id: string;
  spaceId: string;
  key: string;
  name: string;
  color: PaletteKey;
}

export interface SprintPlan {
  /** The `projectId` filter, if any. */
  project: ProjectRef | null;
  sprints: ReportSprintRef[];
  selected: SprintRow | null;
  rows: SprintRow[];
  holidays: Set<string>;
}

/**
 * The sprints covering a project in scope (newest first) and the selected one; 404 for a sprint
 * that covers none.
 */
export async function planSprints(
  db: DbOrTx,
  ctx: ReportContext,
  sprintId: string | undefined,
): Promise<SprintPlan> {
  const scoped = scopedProjectIds(ctx);
  const [sprintRows, projectRows, holidayRows] = await Promise.all([
    rows<SprintRow>(
      db,
      sql`select s.id, s.number, s.name, s.start_date::text as start_date,
          s.end_date::text as end_date,
          array(select x.project_id::text from sprint_projects x
            where x.sprint_id = s.id and x.project_id in ${scoped}) as project_ids
        from sprints s
        where s.workspace_id = ${ctx.workspaceId}
          and exists (select 1 from sprint_projects x
            where x.sprint_id = s.id and x.project_id in ${scoped})
        order by s.start_date desc, s.number desc`,
    ),
    rows<{ id: string; space_id: string; key: string; name: string; color: PaletteKey }>(
      db,
      sql`select p.id, p.space_id, p.key, p.name, p.color from projects p
        join spaces sp on sp.id = p.space_id
        where p.workspace_id = ${ctx.workspaceId}
          and (p.id in ${scoped} ${ctx.projectId ? sql`or p.id = ${ctx.projectId}` : sql``})
        order by sp.position, p.position, p.id`,
    ),
    db
      .select({ date: workspaceHolidays.date })
      .from(workspaceHolidays)
      .where(eq(workspaceHolidays.workspaceId, ctx.workspaceId)),
  ]);
  const refs = projectRows.map((p): ProjectRef => ({
    id: p.id,
    spaceId: p.space_id,
    key: p.key,
    name: p.name,
    color: p.color,
  }));
  const isCurrent = (s: SprintRow) => s.start_date <= ctx.today && ctx.today <= s.end_date;
  const selected = sprintId
    ? sprintRows.find((s) => s.id === sprintId)
    : (sprintRows.find(isCurrent) ??
      sprintRows.find((s) => s.start_date <= ctx.today) ??
      sprintRows[0]);
  if (sprintId && !selected) throw httpError(404, 'NOT_FOUND', 'Sprint not found');
  return {
    project: refs.find((p) => p.id === ctx.projectId) ?? null,
    rows: sprintRows,
    selected: selected ?? null,
    holidays: new Set(holidayRows.map((h) => h.date)),
    sprints: sprintRows.map((s) => toRef(s, isCurrent(s), refs)),
  };
}

const toRef = (
  s: SprintRow,
  current: boolean,
  projects: readonly ProjectRef[],
): ReportSprintRef => ({
  id: s.id,
  number: s.number,
  name: s.name,
  startDate: s.start_date,
  endDate: s.end_date,
  current,
  projects: projects.filter((p) => s.project_ids.includes(p.id)),
});

/**
 * The sprints compared with `s` (recent chart, previous / next, times carried): those sharing a
 * project in scope with it, oldest first.
 */
function relatedSprints(rows: readonly SprintRow[], s: SprintRow): SprintRow[] {
  const mine = new Set(s.project_ids);
  return rows
    .filter((r) => r.id === s.id || r.project_ids.some((id) => mine.has(id)))
    .sort((a, b) =>
      a.start_date === b.start_date ? a.number - b.number : a.start_date < b.start_date ? -1 : 1,
    );
}

/** When a sprint's numbers are read: its end when past, now when current, its start if future. */
function cutoffIso(ctx: ReportContext, s: SprintRow, startIso: string, endIso: string): string {
  if (ctx.today > s.end_date) return endIso;
  if (ctx.today < s.start_date) return startIso;
  return ctx.now.toISOString();
}

/** The instants (ISO) of local midnights, computed by Postgres so time zone rules match. */
async function midnights(db: DbOrTx, timezone: string, dates: string[]): Promise<string[]> {
  if (!dates.length) return [];
  const result = await rows<{ at: string }>(
    db,
    sql`select ${isoTs(sql`d::timestamp at time zone ${timezone}`)} as at
      from unnest(${textArray(dates)}::date[]) with ordinality as x(d, i) order by i`,
  );
  return result.map((r) => r.at);
}

/** Every query of the Sprints report for the selected sprint (the perf script EXPLAINs them). */
export async function sprintQueries(db: DbOrTx, ctx: ReportContext, plan: SprintPlan) {
  const s = plan.selected;
  if (!s) return null;
  const ordered = relatedSprints(plan.rows, s);
  const index = ordered.findIndex((x) => x.id === s.id);
  const prev = index > 0 ? (ordered[index - 1] ?? null) : null;
  const next = ordered[index + 1] ?? null;
  const recent = ordered.slice(Math.max(0, index - RECENT_SPRINTS + 1), index + 1);

  const days = workingDays(s.start_date, s.end_date, plan.holidays);
  const elapsedDays = days.filter((d) => d <= ctx.today);

  // Local midnights: each recent sprint's start and end, then the selected sprint's day ends.
  const instants = await midnights(db, ctx.timezone, [
    ...recent.flatMap((r) => [r.start_date, addDays(r.end_date, 1)]),
    ...elapsedDays.map((d) => addDays(d, 1)),
  ]);
  const at = (i: number) => instants[i] ?? ctx.now.toISOString();
  const starts = recent.map((_, i) => at(2 * i));
  const cutoffs = recent.map((r, i) => cutoffIso(ctx, r, at(2 * i), at(2 * i + 1)));
  const selectedStart = starts[recent.length - 1] ?? at(0);
  const nowIso = ctx.now.toISOString();
  // Burndown points: the start, then each elapsed working day's end (now for today).
  const points = [
    selectedStart,
    ...elapsedDays.map((d, i) => (d === ctx.today ? nowIso : at(2 * recent.length + i))),
  ].map((iso) => (iso > nowIso ? nowIso : iso));

  const selectedCutoff = cutoffs[recent.length - 1] ?? nowIso;
  return {
    sprint: s,
    prev,
    next,
    recent,
    days,
    elapsed: elapsedDays.length,
    startIso: selectedStart,
    cutoffIso: selectedCutoff,
    queries: {
      totals: totalsQuery(
        ctx,
        recent.map((r) => r.id),
        starts,
        cutoffs,
      ),
      burndown: burndownQuery(ctx, s.id, selectedStart, points),
      carried: prev ? carriedQuery(ctx, s, prev, ordered.slice(0, index), selectedCutoff) : null,
      carriedOut: next && ctx.today > s.end_date ? carriedOutQuery(ctx, s, next) : null,
      waiting:
        s.start_date <= ctx.today && ctx.today <= s.end_date
          ? waitingQuery(ctx, s.id, nowIso)
          : null,
    } satisfies Record<string, SQL | null>,
  };
}

export async function buildSprints(
  db: DbOrTx,
  ctx: ReportContext,
  sprintId: string | undefined,
): Promise<Omit<SprintsReport, 'generatedAt'>> {
  const plan = await planSprints(db, ctx, sprintId);
  const [history, detail] = await Promise.all([loadHistory(db, ctx), sprintDetail(db, ctx, plan)]);
  return {
    today: ctx.today,
    timezone: ctx.timezone,
    scope: scopeDto(ctx),
    history,
    project: plan.project,
    sprints: plan.sprints,
    sprint: detail,
  };
}

async function sprintDetail(
  db: DbOrTx,
  ctx: ReportContext,
  plan: SprintPlan,
): Promise<SprintDetail | null> {
  const prepared = await sprintQueries(db, ctx, plan);
  if (!prepared) return null;
  const { sprint: s, prev, next, recent, days, elapsed, queries: q } = prepared;

  const [totals, burn, carried, carriedOut, waiting] = await Promise.all([
    rows<{ id: string; committed: number; added: number; completed: number }>(db, q.totals),
    rows<{ idx: number; remaining: number; added: number }>(db, q.burndown),
    q.carried ? rows<CarriedRow>(db, q.carried) : Promise.resolve([]),
    q.carriedOut ? rows<{ n: number }>(db, q.carriedOut) : Promise.resolve(null),
    q.waiting ? rows<{ category: WaitCategory }>(db, q.waiting) : Promise.resolve([]),
  ]);

  const refOf = (x: SprintRow | null) =>
    x ? (plan.sprints.find((r) => r.id === x.id) ?? null) : null;
  const totalsOf = (id: string) =>
    totals.find((t) => t.id === id) ?? { committed: 0, added: 0, completed: 0 };
  const mine = totalsOf(s.id);
  const state = ctx.today < s.start_date ? 'future' : ctx.today > s.end_date ? 'past' : 'current';

  const total = days.length;
  const committed = mine.committed;
  const ideal = (i: number) => (total ? Math.round(committed * (1 - i / total) * 10) / 10 : 0);
  const burndown = [s.start_date, ...days].map((date, i) => {
    const point = burn.find((b) => b.idx === i + 1);
    return {
      date,
      remaining: state === 'future' ? null : (point?.remaining ?? null),
      ideal: ideal(i),
      added: point?.added ?? 0,
    };
  });

  let projectedRemaining: number | null = null;
  let pace: SprintDetail['pace'] = null;
  const startRemaining = burndown[0]?.remaining;
  const todayRemaining = burndown[elapsed]?.remaining;
  if (state === 'current' && elapsed > 0 && startRemaining != null && todayRemaining != null) {
    const rate = (startRemaining - todayRemaining) / elapsed;
    projectedRemaining = Math.max(
      0,
      Math.round((todayRemaining - rate * (total - elapsed)) * 10) / 10,
    );
    pace = sprintPace(todayRemaining, ideal(elapsed), committed);
  }

  const carriedTasks = carried.map(toCarried);
  return {
    ...(refOf(s) ?? toRef(s, state === 'current', [])),
    state,
    workingDays: { total, elapsed, left: total - elapsed },
    committed,
    carriedIn: carriedTasks.length,
    carriedInRepeated: carriedTasks.filter((t) => t.timesCarried >= 2).length,
    added: mine.added,
    completed: mine.completed,
    carriedOut: carriedOut ? (carriedOut[0]?.n ?? 0) : state === 'past' ? 0 : null,
    previousSprint: refOf(prev),
    nextSprint: refOf(next),
    burndown,
    projectedRemaining,
    pace,
    waitingMost: waiting[0]?.category ?? null,
    recent: recent.map((r) => {
      const ref = refOf(r) ?? toRef(r, false, []);
      const t = totalsOf(r.id);
      return { ...ref, committed: t.committed, added: t.added, completed: t.completed };
    }),
    carried: carriedTasks,
  };
}
