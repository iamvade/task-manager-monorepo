import type { Subtask } from '@kite/shared';
import { asc, eq, max, min } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { positionAfter, positionBefore } from '../db/position.js';
import { subtasks, users } from '../db/schema/index.js';
import { userRefColumns } from './user-ref.js';

type SubtaskRow = typeof subtasks.$inferSelect;

const select = (db: DbOrTx) =>
  db
    .select({ subtask: subtasks, assignee: userRefColumns })
    .from(subtasks)
    .leftJoin(users, eq(users.id, subtasks.assigneeId));

const toDto = ({
  subtask,
  assignee,
}: {
  subtask: SubtaskRow;
  assignee: Subtask['assignee'];
}): Subtask => ({
  id: subtask.id,
  title: subtask.title,
  assignee,
  dueDate: subtask.dueDate,
  done: subtask.done,
  position: subtask.position,
});

/** Subtasks of a task, by position. */
export async function listSubtasks(db: DbOrTx, taskId: string): Promise<Subtask[]> {
  const rows = await select(db)
    .where(eq(subtasks.taskId, taskId))
    .orderBy(asc(subtasks.position), asc(subtasks.id));
  return rows.map(toDto);
}

export async function getSubtask(db: DbOrTx, subtaskId: string): Promise<Subtask | undefined> {
  const [row] = await select(db).where(eq(subtasks.id, subtaskId));
  return row && toDto(row);
}

/** Position at the end of a task's subtasks. */
export async function endOfSubtasks(db: DbOrTx, taskId: string) {
  const [row] = await db
    .select({ last: max(subtasks.position) })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId));
  return positionAfter(row?.last);
}

/** Position at the top of a task's subtasks. */
export async function startOfSubtasks(db: DbOrTx, taskId: string) {
  const [row] = await db
    .select({ first: min(subtasks.position) })
    .from(subtasks)
    .where(eq(subtasks.taskId, taskId));
  return positionBefore(row?.first);
}
