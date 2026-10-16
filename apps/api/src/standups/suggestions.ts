import {
  addDays,
  formatTaskKey,
  previousStandupDay,
  STANDUP_SUGGESTION_KINDS,
  STANDUP_TODAY_TAGS,
  type StandupSuggestionKind,
  type StandupSuggestions,
  type StandupTaskRef,
  type StandupTodayTag,
} from '@kite/shared';
import { and, eq, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import type { standupGroups } from '../db/schema/index.js';
import {
  activity,
  comments,
  projects,
  statuses,
  taskAssignees,
  tasks,
} from '../db/schema/index.js';
import { commentOfActivity } from '../notifications/display.js';
import { dayEnd, dayStart, holidaySet, postByInstant } from './schedule.js';

type GroupRow = typeof standupGroups.$inferSelect;

/** Without a previous standup day in the last 31 days, look back this far. */
const FALLBACK_DAYS = 7;

const taskColumns = {
  id: tasks.id,
  number: tasks.number,
  title: tasks.title,
  dueDate: tasks.dueDate,
  category: statuses.category,
  projectId: projects.id,
  projectKey: projects.key,
  projectName: projects.name,
  projectColor: projects.color,
};

interface TaskRow {
  id: string;
  number: number;
  title: string;
  dueDate: string | null;
  category: StandupTaskRef['statusCategory'];
  projectId: string;
  projectKey: string;
  projectName: string;
  projectColor: StandupTaskRef['project']['color'];
}

const toRef = (r: TaskRow): StandupTaskRef => ({
  id: r.id,
  key: formatTaskKey(r.projectKey, r.number),
  title: r.title,
  project: { id: r.projectId, key: r.projectKey, name: r.projectName, color: r.projectColor },
  statusCategory: r.category,
});

/**
 * The write modal's suggestions for `userId` on the group's day `date`.
 *
 * Yesterday: my own activity since the previous standup day's post-by time (weekends and
 * holidays in between included), until now (or the end of `date`). Completed = a status change
 * into a done status, Moved to review = into review, Commented on = a comment that still exists.
 * A task appears once with its strongest kind, and only while it's still in that state (a task
 * moved to review and then reopened isn't suggested). Deleted tasks are left out.
 *
 * Today: my open tasks in the workspace that are overdue, due on `date`, or in progress.
 */
export async function buildSuggestions(
  db: DbOrTx,
  group: GroupRow,
  userId: string,
  date: string,
  now: Date,
): Promise<StandupSuggestions> {
  const holidays = await holidaySet(db, group.workspaceId);
  const previousDate = previousStandupDay(group, date, holidays);
  const since = previousDate
    ? postByInstant(group, previousDate)
    : dayStart(group, addDays(date, -FALLBACK_DAYS));
  const end = dayEnd(group, date);
  const until = now < end ? now : end;

  const toCategory = sql<string | null>`${activity.payload} -> 'to' ->> 'category'`;
  const [events, open] = await Promise.all([
    db
      .select({
        type: activity.type,
        at: activity.createdAt,
        toCategory,
        commentId: comments.id,
        task: taskColumns,
      })
      .from(activity)
      .innerJoin(tasks, and(eq(tasks.id, activity.taskId), isNull(tasks.deletedAt)))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .leftJoin(comments, commentOfActivity)
      .where(
        and(
          eq(activity.actorId, userId),
          eq(activity.workspaceId, group.workspaceId),
          gte(activity.createdAt, since),
          lt(activity.createdAt, until),
          or(
            and(eq(activity.type, 'status.changed'), inArray(toCategory, ['done', 'review'])),
            eq(activity.type, 'comment.added'),
          ),
        ),
      ),
    db
      .select(taskColumns)
      .from(tasks)
      .innerJoin(taskAssignees, eq(taskAssignees.taskId, tasks.id))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .innerJoin(statuses, eq(statuses.id, tasks.statusId))
      .where(
        and(
          eq(taskAssignees.userId, userId),
          eq(projects.workspaceId, group.workspaceId),
          isNull(projects.archivedAt),
          isNull(tasks.deletedAt),
          ne(statuses.category, 'done'),
          or(sql`${tasks.dueDate} <= ${date}`, eq(statuses.category, 'in_progress')),
        ),
      ),
  ]);

  const best = new Map<string, { kind: StandupSuggestionKind; at: Date; task: TaskRow }>();
  const rank = (k: StandupSuggestionKind) => STANDUP_SUGGESTION_KINDS.indexOf(k);
  for (const e of events) {
    const current = e.task.category;
    let kind: StandupSuggestionKind | null = null;
    if (e.type === 'comment.added') kind = e.commentId ? 'commented' : null;
    else if (e.toCategory === 'done') kind = current === 'done' ? 'completed' : null;
    else if (e.toCategory === 'review')
      kind = current === 'review' || current === 'done' ? 'review' : null;
    if (!kind) continue;
    const prev = best.get(e.task.id);
    if (
      !prev ||
      rank(kind) < rank(prev.kind) ||
      (kind === prev.kind && e.at.getTime() > prev.at.getTime())
    ) {
      best.set(e.task.id, { kind, at: e.at, task: e.task });
    }
  }
  const yesterday = [...best.values()]
    .sort((a, b) => b.at.getTime() - a.at.getTime() || (a.task.id < b.task.id ? -1 : 1))
    .map((s) => ({ kind: s.kind, task: toRef(s.task), at: s.at.toISOString() }));

  const tagOf = (t: TaskRow): StandupTodayTag =>
    t.dueDate !== null && t.dueDate < date
      ? 'overdue'
      : t.dueDate === date
        ? 'due_today'
        : 'in_progress';
  const today = [...new Map(open.map((t) => [t.id, t])).values()]
    .map((t) => ({ tag: tagOf(t), t }))
    .sort(
      (a, b) =>
        STANDUP_TODAY_TAGS.indexOf(a.tag) - STANDUP_TODAY_TAGS.indexOf(b.tag) ||
        (a.t.dueDate ?? '').localeCompare(b.t.dueDate ?? '') ||
        a.t.title.localeCompare(b.t.title),
    )
    .map(({ tag, t }) => ({ tag, task: toRef(t) }));

  return {
    date,
    previousDate,
    since: since.toISOString(),
    until: until.toISOString(),
    yesterday,
    today,
  };
}
