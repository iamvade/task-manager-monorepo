import {
  PRIORITIES,
  addDays,
  daysBetween,
  formatTaskKey,
  startOfWeek,
  todayInZone,
  weekdayIndex,
  type Home,
  type MyTask,
} from '@kite/shared';
import { and, eq, isNull, ne, or, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { UserRow } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import { projects, spaces, statuses, taskAssignees, tasks } from '../db/schema/index.js';
import { projectRefColumns } from '../notifications/display.js';
import { listMyActivity } from './activity.js';

export const HOME_ACTIVITY_LIMIT = 10;

const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i])) as Record<
  MyTask['priority'],
  number
>;

/** Due date ascending (none last), then priority, then oldest first. */
function compareTasks(a: MyTask & { createdAt: Date }, b: MyTask & { createdAt: Date }) {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : 1)
  );
}

/** Tasks assigned to me in the workspace: not deleted, project not archived. */
const mineIn = (userId: string, workspaceId: string) =>
  and(
    eq(taskAssignees.userId, userId),
    eq(projects.workspaceId, workspaceId),
    isNull(projects.archivedAt),
    isNull(tasks.deletedAt),
  );

/**
 * `GET /me/home`. Days are in the user's time zone: due dates are plain dates compared with
 * today there, and completions are bucketed by their local date.
 */
export async function buildHome(
  db: DbOrTx,
  log: FastifyBaseLogger,
  user: UserRow,
  workspaceId: string,
  now: Date,
): Promise<Home> {
  const timezone = user.timezone;
  const today = todayInZone(timezone, now);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const lastWeekStart = addDays(weekStart, -7);
  const todayIndex = weekdayIndex(today);

  const localDay = sql<string>`to_char(${tasks.completedAt} at time zone ${timezone}, 'YYYY-MM-DD')`;
  const [taskRows, completions, activity] = await Promise.all([
    db
      .select({
        id: tasks.id,
        number: tasks.number,
        title: tasks.title,
        priority: tasks.priority,
        dueDate: tasks.dueDate,
        completedAt: tasks.completedAt,
        createdAt: tasks.createdAt,
        status: {
          id: statuses.id,
          name: statuses.name,
          category: statuses.category,
          color: statuses.color,
        },
        project: projectRefColumns,
        space: { id: spaces.id, initial: spaces.initial, color: spaces.color },
      })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(spaces, eq(spaces.id, projects.spaceId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(
        and(
          mineIn(user.id, workspaceId),
          // Open tasks, plus done ones due today ("3 of 4 left").
          or(ne(statuses.category, 'done'), eq(tasks.dueDate, today)),
        ),
      ),
    db
      .select({ day: localDay, n: sql<number>`count(*)::int` })
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(
        and(
          mineIn(user.id, workspaceId),
          eq(statuses.category, 'done'),
          sql`${tasks.completedAt} >= (${lastWeekStart}::timestamp at time zone ${timezone})`,
          sql`${tasks.completedAt} < (${addDays(weekStart, 7)}::timestamp at time zone ${timezone})`,
        ),
      )
      // By position: the expression carries parameters, which Postgres won't match up.
      .groupBy(sql`1`),
    listMyActivity(db, log, user.id, { workspaceId, limit: HOME_ACTIVITY_LIMIT }),
  ]);

  const all = taskRows
    .map((t) => ({
      id: t.id,
      key: formatTaskKey(t.project.key, t.number),
      title: t.title,
      priority: t.priority,
      dueDate: t.dueDate,
      done: t.status.category === 'done',
      completedAt: t.completedAt?.toISOString() ?? null,
      status: t.status,
      project: t.project,
      space: t.space,
      createdAt: t.createdAt,
    }))
    .sort(compareTasks);
  const strip = ({ createdAt: _, ...task }: (typeof all)[number]): MyTask => task;

  const overdue = all.filter((t) => !t.done && t.dueDate !== null && t.dueDate < today);
  const dueToday = all.filter((t) => t.dueDate === today);
  const thisWeek = all.filter(
    (t) => !t.done && t.dueDate !== null && t.dueDate > today && t.dueDate <= weekEnd,
  );
  const later = all.filter((t) => !t.done && (t.dueDate === null || t.dueDate > weekEnd));

  const perDayOf = (start: string) =>
    Array.from(
      { length: 7 },
      (_, i) => completions.find((c) => c.day === addDays(start, i))?.n ?? 0,
    );
  const perDay = perDayOf(weekStart);
  const lastWeek = perDayOf(lastWeekStart);
  const sumThrough = (days: number[]) => days.slice(0, todayIndex + 1).reduce((a, b) => a + b, 0);
  const oldestDue = overdue[0]?.dueDate;

  return {
    today,
    timezone,
    weekStart,
    sections: {
      overdue: overdue.map(strip),
      today: dueToday.map(strip),
      thisWeek: thisWeek.map(strip),
      later: later.map(strip),
    },
    stats: {
      dueToday: {
        open: dueToday.filter((t) => !t.done).length,
        total: dueToday.length,
        urgent: dueToday.filter((t) => !t.done && t.priority === 'urgent').length,
      },
      completedThisWeek: {
        count: perDay.reduce((a, b) => a + b, 0),
        delta: sumThrough(perDay) - sumThrough(lastWeek),
        perDay,
      },
      overdue: {
        count: overdue.length,
        oldestDaysLate: oldestDue ? daysBetween(oldestDue, today) : null,
      },
    },
    activity,
  };
}
