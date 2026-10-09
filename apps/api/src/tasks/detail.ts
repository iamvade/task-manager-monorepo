import type { TaskDetail } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { attachments, sprints, subtasks, taskFollowers, tasks, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { toSprintDto } from '../projects/detail.js';
import { getTaskListItem } from './list.js';

/** `UserRef` columns of `users`. */
export const userRefColumns = {
  id: users.id,
  name: users.name,
  initials: users.initials,
  avatarColor: users.avatarColor,
};

/**
 * Body of `GET /tasks/:ref` (deleted tasks included). Runs its queries in parallel, so pass the
 * pool, not a transaction.
 */
export async function buildTaskDetail(db: Db, taskId: string): Promise<TaskDetail> {
  const [item, [row], subtaskRows, attachmentRows, followers] = await Promise.all([
    getTaskListItem(db, taskId),
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
    db
      .select({ subtask: subtasks, assignee: userRefColumns })
      .from(subtasks)
      .leftJoin(users, eq(users.id, subtasks.assigneeId))
      .where(eq(subtasks.taskId, taskId))
      .orderBy(asc(subtasks.position), asc(subtasks.id)),
    db
      .select({ attachment: attachments, uploader: userRefColumns })
      .from(attachments)
      .innerJoin(users, eq(users.id, attachments.uploaderId))
      .where(eq(attachments.taskId, taskId))
      .orderBy(asc(attachments.createdAt), asc(attachments.id)),
    db
      .select(userRefColumns)
      .from(taskFollowers)
      .innerJoin(users, eq(users.id, taskFollowers.userId))
      .where(eq(taskFollowers.taskId, taskId))
      .orderBy(asc(users.name), asc(users.id)),
  ]);
  if (!item || !row) throw httpError(404, 'NOT_FOUND', 'Task not found');

  return {
    ...item,
    description: row.description,
    descriptionText: row.descriptionText,
    sprint: row.sprint ? toSprintDto(row.sprint) : null,
    creator: row.creator,
    subtasks: subtaskRows.map(({ subtask, assignee }) => ({
      id: subtask.id,
      title: subtask.title,
      assignee,
      dueDate: subtask.dueDate,
      done: subtask.done,
      position: subtask.position,
    })),
    attachments: attachmentRows.map(({ attachment, uploader }) => ({
      id: attachment.id,
      filename: attachment.filename,
      mime: attachment.mime,
      size: attachment.size,
      uploader,
      createdAt: attachment.createdAt.toISOString(),
    })),
    followers,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
