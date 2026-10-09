import {
  UNASSIGNED,
  formatTaskKey,
  type SpaceTaskListQuery,
  type TaskListItem,
  type TaskListQuery,
  type Tag,
  type UserRef,
} from '@kite/shared';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { projects, statuses, taskAssignees, taskTags, tasks } from '../db/schema/index.js';

/** `%`, `_` and `\` are literal in the search text. */
export const escapeLike = (text: string) => text.replace(/[\\%_]/g, '\\$&');

// Aggregates are correlated subqueries: one statement for the whole list, no N+1.
const assigneesSql = sql<UserRef[]>`coalesce((
  select json_agg(json_build_object(
    'id', u.id, 'name', u.name, 'initials', u.initials, 'avatarColor', u.avatar_color
  ) order by u.name, u.id)
  from task_assignees ta join users u on u.id = ta.user_id
  where ta.task_id = ${tasks.id}), '[]'::json)`;

const tagsSql = sql<Tag[]>`coalesce((
  select json_agg(json_build_object('id', tg.id, 'name', tg.name, 'color', tg.color)
    order by tg.name, tg.id)
  from task_tags tt join tags tg on tg.id = tt.tag_id
  where tt.task_id = ${tasks.id}), '[]'::json)`;

const subtaskProgressSql = sql<{ done: number; total: number }>`(
  select json_build_object('done', count(*) filter (where s.done), 'total', count(*))
  from subtasks s where s.task_id = ${tasks.id})`;

const commentCountSql = sql<number>`(
  select count(*)::int from comments c where c.task_id = ${tasks.id} and c.deleted_at is null)`;

const attachmentCountSql = sql<number>`(
  select count(*)::int from attachments a where a.task_id = ${tasks.id})`;

const listColumns = {
  task: {
    id: tasks.id,
    number: tasks.number,
    title: tasks.title,
    priority: tasks.priority,
    startDate: tasks.startDate,
    dueDate: tasks.dueDate,
    position: tasks.position,
    sprintId: tasks.sprintId,
    completedAt: tasks.completedAt,
    createdAt: tasks.createdAt,
    updatedAt: tasks.updatedAt,
  },
  project: {
    id: projects.id,
    spaceId: projects.spaceId,
    key: projects.key,
    name: projects.name,
    color: projects.color,
  },
  status: {
    id: statuses.id,
    name: statuses.name,
    category: statuses.category,
    color: statuses.color,
  },
  assignees: assigneesSql,
  tags: tagsSql,
  subtaskProgress: subtaskProgressSql,
  commentCount: commentCountSql,
  attachmentCount: attachmentCountSql,
};

/** Filter conditions shared by the project- and space-level lists. */
export function taskFilters(db: DbOrTx, query: TaskListQuery): SQL[] {
  const where: SQL[] = [isNull(tasks.deletedAt)];
  if (query.statusId?.length) where.push(inArray(tasks.statusId, query.statusId));
  if (query.statusCategory?.length) where.push(inArray(statuses.category, query.statusCategory));
  if (query.priority?.length) where.push(inArray(tasks.priority, query.priority));
  if (query.sprintId) where.push(eq(tasks.sprintId, query.sprintId));
  if (query.dueFrom) where.push(gte(tasks.dueDate, query.dueFrom));
  if (query.dueTo) where.push(lte(tasks.dueDate, query.dueTo));
  if (query.hasDueDate !== undefined) {
    where.push(query.hasDueDate ? isNotNull(tasks.dueDate) : isNull(tasks.dueDate));
  }
  if (!query.includeDone) where.push(ne(statuses.category, 'done'));

  if (query.assigneeId?.length) {
    const ids = query.assigneeId.filter((id) => id !== UNASSIGNED);
    const assigned = (extra?: SQL) =>
      db
        .select({ one: sql`1` })
        .from(taskAssignees)
        .where(and(eq(taskAssignees.taskId, tasks.id), extra));
    const anyOf: SQL[] = [];
    if (ids.length > 0) anyOf.push(exists(assigned(inArray(taskAssignees.userId, ids))));
    if (ids.length < query.assigneeId.length) anyOf.push(notExists(assigned()));
    const match = or(...anyOf);
    if (match) where.push(match);
  }
  if (query.tagId?.length) {
    where.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(taskTags)
          .where(and(eq(taskTags.taskId, tasks.id), inArray(taskTags.tagId, query.tagId))),
      ),
    );
  }
  if (query.q) {
    // Substring or fuzzy word match; both can use the trigram GIN index on the title.
    const match = or(
      ilike(tasks.title, `%${escapeLike(query.q)}%`),
      sql`${query.q} <% ${tasks.title}`,
    );
    if (match) where.push(match);
  }
  return where;
}

function taskOrder({ sort, dir }: Pick<TaskListQuery, 'sort' | 'dir'>, spaceLevel: boolean) {
  const by = dir === 'desc' ? desc : asc;
  const tail = [asc(tasks.position), asc(tasks.id)];
  switch (sort) {
    case 'position':
      // A space-level list has no cross-project order; keep each project's tasks together.
      return [
        ...(spaceLevel ? [asc(projects.position)] : []),
        by(statuses.position),
        by(tasks.position),
        asc(tasks.id),
      ];
    case 'dueDate':
      return [sql`${tasks.dueDate} ${sql.raw(dir)} nulls last`, ...tail];
    case 'priority':
      // The enum is declared urgent → none, so ascending = most urgent first.
      return [by(tasks.priority), ...tail];
    case 'createdAt':
      return [by(tasks.createdAt), ...tail];
  }
}

type ListRow = Awaited<ReturnType<typeof selectTaskList>>[number];

function selectTaskList(db: DbOrTx, where: SQL[], order: SQL[]) {
  return db
    .select(listColumns)
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(statuses, eq(statuses.id, tasks.statusId))
    .where(and(...where))
    .orderBy(...order);
}

export const toTaskListItem = (row: ListRow): TaskListItem => ({
  ...row.task,
  key: formatTaskKey(row.project.key, row.task.number),
  project: row.project,
  status: row.status,
  completedAt: row.task.completedAt?.toISOString() ?? null,
  createdAt: row.task.createdAt.toISOString(),
  updatedAt: row.task.updatedAt.toISOString(),
  assignees: row.assignees,
  tags: row.tags,
  subtaskProgress: row.subtaskProgress,
  commentCount: row.commentCount,
  attachmentCount: row.attachmentCount,
});

/** `GET /projects/:id/tasks`. */
export async function listProjectTasks(db: DbOrTx, projectId: string, query: TaskListQuery) {
  const where = [eq(tasks.projectId, projectId), ...taskFilters(db, query)];
  const rows = await selectTaskList(db, where, taskOrder(query, false));
  return rows.map(toTaskListItem);
}

/** `GET /spaces/:id/tasks`: every non-archived project of the space. */
export async function listSpaceTasks(db: DbOrTx, spaceId: string, query: SpaceTaskListQuery) {
  const where = [
    eq(projects.spaceId, spaceId),
    isNull(projects.archivedAt),
    ...(query.projectId?.length ? [inArray(tasks.projectId, query.projectId)] : []),
    ...taskFilters(db, query),
  ];
  const rows = await selectTaskList(db, where, taskOrder(query, true));
  return rows.map(toTaskListItem);
}

/** One task as a list item, deleted or not (move/complete responses, the detail base). */
export async function getTaskListItem(db: DbOrTx, taskId: string): Promise<TaskListItem | null> {
  const [row] = await selectTaskList(db, [eq(tasks.id, taskId)], []);
  return row ? toTaskListItem(row) : null;
}
