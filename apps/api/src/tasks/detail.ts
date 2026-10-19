import { formatTaskKey, type TaskDetail } from '@kite/shared';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../db/client.js';
import {
  comments,
  projects,
  sprints,
  statuses,
  taskReferences,
  tasks,
  users,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { reportsOfTask } from '../feedback/query.js';
import { sprintDto } from '../sprints/query.js';
import { listAttachments } from './attachments.js';
import { listFollowers } from './followers.js';
import { getTaskListItem } from './list.js';
import { listSubtasks } from './subtasks.js';
import { userRefColumns } from './user-ref.js';

/**
 * Body of `GET /tasks/:ref` (deleted tasks included). Runs its queries in parallel, so pass the
 * pool, not a transaction.
 */
export async function buildTaskDetail(
  db: Db,
  taskId: string,
  viewerId: string | null,
): Promise<TaskDetail> {
  const [item, [row], subtaskRows, attachmentRows, followers, refs, reports] = await Promise.all([
    getTaskListItem(db, taskId, viewerId),
    db
      .select({
        description: tasks.description,
        descriptionText: tasks.descriptionText,
        deletedAt: tasks.deletedAt,
        creator: userRefColumns,
        sprint: sprints,
      })
      .from(tasks)
      .innerJoin(users, eq(users.id, tasks.createdBy))
      .leftJoin(sprints, eq(sprints.id, tasks.sprintId))
      .where(eq(tasks.id, taskId)),
    listSubtasks(db, taskId),
    listAttachments(db, taskId),
    listFollowers(db, taskId),
    mentionedIn(db, taskId),
    reportsOfTask(db, taskId),
  ]);
  if (!item || !row) throw httpError(404, 'NOT_FOUND', 'Task not found');
  const [[reviewer], sprint] = await Promise.all([
    item.reviewerId
      ? db.select(userRefColumns).from(users).where(eq(users.id, item.reviewerId))
      : [],
    row.sprint ? sprintDto(db, row.sprint) : null,
  ]);

  return {
    ...item,
    description: row.description,
    descriptionText: row.descriptionText,
    sprint,
    reviewer: reviewer ?? null,
    creator: row.creator,
    subtasks: subtaskRows,
    attachments: attachmentRows,
    followers,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    mentionedIn: refs,
    linkedFeedback: reports.reverse(),
  };
}

const source = alias(tasks, 'source');

/** "Mentioned in": live tasks (and live comments) that reference `taskId`. */
async function mentionedIn(db: Db, taskId: string): Promise<TaskDetail['mentionedIn']> {
  const rows = await db
    .select({
      id: source.id,
      number: source.number,
      title: source.title,
      projectKey: projects.key,
      status: {
        id: statuses.id,
        name: statuses.name,
        category: statuses.category,
        color: statuses.color,
      },
      commentId: taskReferences.commentId,
      createdAt: taskReferences.createdAt,
    })
    .from(taskReferences)
    .innerJoin(source, eq(source.id, taskReferences.sourceTaskId))
    .innerJoin(projects, eq(projects.id, source.projectId))
    .innerJoin(statuses, eq(statuses.id, source.statusId))
    .leftJoin(comments, eq(comments.id, taskReferences.commentId))
    .where(
      and(
        eq(taskReferences.targetTaskId, taskId),
        isNull(source.deletedAt),
        or(isNull(taskReferences.commentId), isNull(comments.deletedAt)),
      ),
    )
    .orderBy(desc(taskReferences.createdAt))
    .limit(50);
  return rows.map((r) => ({
    task: {
      id: r.id,
      key: formatTaskKey(r.projectKey, r.number),
      title: r.title,
      status: r.status,
    },
    commentId: r.commentId,
    createdAt: r.createdAt.toISOString(),
  }));
}
