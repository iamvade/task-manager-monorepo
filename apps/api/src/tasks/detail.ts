import type { TaskDetail } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sprints, tasks, users } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { toSprintDto } from '../projects/detail.js';
import { listAttachments } from './attachments.js';
import { listFollowers } from './followers.js';
import { getTaskListItem } from './list.js';
import { listSubtasks } from './subtasks.js';
import { userRefColumns } from './user-ref.js';

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
    listSubtasks(db, taskId),
    listAttachments(db, taskId),
    listFollowers(db, taskId),
  ]);
  if (!item || !row) throw httpError(404, 'NOT_FOUND', 'Task not found');

  return {
    ...item,
    description: row.description,
    descriptionText: row.descriptionText,
    sprint: row.sprint ? toSprintDto(row.sprint) : null,
    creator: row.creator,
    subtasks: subtaskRows,
    attachments: attachmentRows,
    followers,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}
