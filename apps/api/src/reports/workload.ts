import {
  LOAD_WINDOW_DAYS,
  addDays,
  formatTaskKey,
  startOfWeek,
  workloadLoad,
  type PaletteKey,
  type Priority,
  type Size,
  type UserRef,
  type WorkloadBucket,
  type WorkloadPerson,
  type WorkloadReport,
} from '@kite/shared';
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import {
  loadHistory,
  scopeDto,
  scopedProjectIds,
  taskInScope,
  type ReportContext,
} from './scope.js';
import { rows, sizePoints } from './sql.js';
import { assigneesColumn } from './tasks.js';

/**
 * Open tasks in the scope per assignee (a task with several assignees counts for each), with
 * their due bucket: overdue (before today), week (today → Sunday), later, none; `counted` =
 * the task weighs on the load (`LOAD_WINDOW_DAYS`): due by today + 13 days (overdue included)
 * or in a sprint running today.
 */
const assignedOpen = (ctx: ReportContext, weekEnd: string) => sql`
  select ta.user_id, t.id, t.number, t.title, t.priority, t.size, t.due_date, t.project_id,
    ${sizePoints('t')} as pts,
    case
      when t.due_date is null then 'none'
      when t.due_date < ${ctx.today}::date then 'overdue'
      when t.due_date <= ${weekEnd}::date then 'week'
      else 'later'
    end as bucket,
    (t.due_date <= ${addDays(ctx.today, LOAD_WINDOW_DAYS - 1)}::date
      or exists (select 1 from sprints s where s.id = t.sprint_id
        and s.start_date <= ${ctx.today}::date and s.end_date >= ${ctx.today}::date)
    ) is true as counted
  from tasks t
  join task_assignees ta on ta.task_id = t.id
  where ${taskInScope(ctx, 't')} and t.completed_at is null`;

/**
 * Who is listed: every workspace member, or with a scope filter the scoped projects' members
 * plus anyone with open tasks there.
 */
const listedPeople = (ctx: ReportContext) =>
  ctx.spaceId || ctx.projectId
    ? sql`(wm.user_id in (select pm.user_id from project_members pm
          where pm.project_id in ${scopedProjectIds(ctx)})
        or wm.user_id in (select user_id from a))`
    : sql`true`;

const bucketSums = (['overdue', 'week', 'later', 'none'] as const).map((b) =>
  sql.raw(`
    coalesce(sum(a.pts) filter (where a.bucket = '${b}'), 0)::int as ${b}_points,
    (count(a.id) filter (where a.bucket = '${b}'))::int as ${b}_tasks`),
);

const peopleQuery = (ctx: ReportContext, weekEnd: string) => sql`
  with a as (${assignedOpen(ctx, weekEnd)})
  select u.id, u.name, u.initials, u.avatar_color, wm.title, wm.capacity_points,
    count(a.id)::int as open_tasks, coalesce(sum(a.pts), 0)::int as points,
    coalesce(sum(a.pts) filter (where a.counted), 0)::int as load_points,
    ${sql.join(bucketSums, sql`,`)}
  from workspace_members wm
  join users u on u.id = wm.user_id
  left join a on a.user_id = wm.user_id
  where wm.workspace_id = ${ctx.workspaceId} and ${listedPeople(ctx)}
  group by u.id, u.name, u.initials, u.avatar_color, wm.title, wm.capacity_points
  order by points desc, u.name, u.id`;

const tasksQuery = (ctx: ReportContext, weekEnd: string) => sql`
  with a as (${assignedOpen(ctx, weekEnd)})
  select a.user_id, a.id, a.number, a.title, a.priority, a.size, a.pts,
    a.due_date::text as due_date, a.bucket, a.counted,
    p.id as project_id, p.space_id as project_space_id, p.key as project_key,
    p.name as project_name, p.color as project_color, ${assigneesColumn('a')}
  from a join projects p on p.id = a.project_id
  order by a.user_id,
    array_position(array['overdue', 'week', 'later', 'none'], a.bucket),
    a.due_date nulls last, p.key, a.number`;

interface PersonRow extends Record<string, unknown> {
  id: string;
  name: string;
  initials: string;
  avatar_color: PaletteKey;
  title: string | null;
  capacity_points: number;
  open_tasks: number;
  points: number;
  load_points: number;
  overdue_points: number;
  overdue_tasks: number;
  week_points: number;
  week_tasks: number;
  later_points: number;
  later_tasks: number;
  none_points: number;
  none_tasks: number;
}

interface TaskRow extends Record<string, unknown> {
  user_id: string;
  id: string;
  number: number;
  title: string;
  priority: Priority;
  size: Size | null;
  pts: number;
  due_date: string | null;
  bucket: WorkloadBucket;
  counted: boolean;
  project_id: string;
  project_space_id: string;
  project_key: string;
  project_name: string;
  project_color: PaletteKey;
  assignees: UserRef[];
}

/** Every query of the Workload report (the perf script EXPLAINs them). */
export function workloadQueries(ctx: ReportContext) {
  const weekEnd = addDays(startOfWeek(ctx.today), 6);
  return { weekEnd, people: peopleQuery(ctx, weekEnd), tasks: tasksQuery(ctx, weekEnd) };
}

export async function buildWorkload(
  db: DbOrTx,
  ctx: ReportContext,
): Promise<Omit<WorkloadReport, 'generatedAt'>> {
  const q = workloadQueries(ctx);
  const [history, people, tasks] = await Promise.all([
    loadHistory(db, ctx),
    rows<PersonRow>(db, q.people),
    rows<TaskRow>(db, q.tasks),
  ]);

  const result: WorkloadPerson[] = people.map((p) => ({
    user: { id: p.id, name: p.name, initials: p.initials, avatarColor: p.avatar_color },
    title: p.title,
    capacity: p.capacity_points,
    openTasks: p.open_tasks,
    points: p.points,
    loadPoints: p.load_points,
    buckets: {
      overdue: { points: p.overdue_points, tasks: p.overdue_tasks },
      week: { points: p.week_points, tasks: p.week_tasks },
      later: { points: p.later_points, tasks: p.later_tasks },
      none: { points: p.none_points, tasks: p.none_tasks },
    },
    load: workloadLoad(p.load_points, p.overdue_points, p.capacity_points),
    tasks: tasks
      .filter((t) => t.user_id === p.id)
      .map((t) => ({
        id: t.id,
        key: formatTaskKey(t.project_key, t.number),
        title: t.title,
        priority: t.priority,
        size: t.size,
        points: t.pts,
        dueDate: t.due_date,
        bucket: t.bucket,
        counted: t.counted,
        project: {
          id: t.project_id,
          spaceId: t.project_space_id,
          key: t.project_key,
          name: t.project_name,
          color: t.project_color,
        },
        assignees: t.assignees,
      })),
  }));

  // Distinct open tasks: a task with two assignees appears under both but counts once here.
  const distinct = new Map(tasks.map((t) => [t.id, t.pts]));
  return {
    today: ctx.today,
    timezone: ctx.timezone,
    scope: scopeDto(ctx),
    history,
    weekEnd: q.weekEnd,
    people: result,
    totals: {
      openTasks: distinct.size,
      points: [...distinct.values()].reduce((a, b) => a + b, 0),
    },
  };
}
