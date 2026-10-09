import type { StatusSnapshot } from '@kite/shared';
import { and, eq, inArray, max, min } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { positionAfter, positionBefore } from '../db/position.js';
import { sprints, statuses, tags, tasks, users, workspaceMembers } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import type { TaskMutation, TaskRow } from './mutation.js';

type StatusRow = typeof statuses.$inferSelect;

const invalidReference = (what: string) =>
  httpError(400, 'INVALID_REFERENCE', `${what} does not belong to this project or workspace`);

export const statusSnapshot = (s: StatusRow): StatusSnapshot => ({
  id: s.id,
  name: s.name,
  category: s.category,
});

export async function requireStatusIn(db: DbOrTx, projectId: string, statusId: string) {
  const [status] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));
  if (!status) throw invalidReference('Status');
  return status;
}

export async function requireSprintIn(db: DbOrTx, projectId: string, sprintId: string) {
  const [sprint] = await db
    .select()
    .from(sprints)
    .where(and(eq(sprints.id, sprintId), eq(sprints.projectId, projectId)));
  if (!sprint) throw invalidReference('Sprint');
  return sprint;
}

/** Users by id, all of whom must be members of the workspace; by name. */
export async function requireMembers(db: DbOrTx, workspaceId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), inArray(users.id, unique)))
    .orderBy(users.name);
  if (rows.length !== unique.length) throw invalidReference('Assignee');
  return rows;
}

/** Tags by id, all of which must belong to the workspace; by name. */
export async function requireTags(db: DbOrTx, workspaceId: string, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.workspaceId, workspaceId), inArray(tags.id, unique)))
    .orderBy(tags.name);
  if (rows.length !== unique.length) throw invalidReference('Tag');
  return rows;
}

// Edge positions count soft-deleted tasks too, so a restored task never collides with a new one.

/** Position at the end of a status. */
export async function endOfStatus(db: DbOrTx, statusId: string) {
  const [row] = await db
    .select({ last: max(tasks.position) })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  return positionAfter(row?.last);
}

/** Position at the top of a status. */
export async function startOfStatus(db: DbOrTx, statusId: string) {
  const [row] = await db
    .select({ first: min(tasks.position) })
    .from(tasks)
    .where(eq(tasks.statusId, statusId));
  return positionBefore(row?.first);
}

/**
 * Moves `task` from status `from` to `to` (end of the new status unless `position` is given) and
 * logs `status.changed`. `completed_at` is set on entering a done status, cleared on leaving
 * one and kept between two done statuses.
 */
export async function changeStatus(
  m: TaskMutation,
  task: TaskRow,
  from: StatusRow,
  to: StatusRow,
  position?: string,
) {
  m.log(task.id, 'status.changed', { from: statusSnapshot(from), to: statusSnapshot(to) });
  const wasDone = from.category === 'done';
  const isDone = to.category === 'done';
  return {
    statusId: to.id,
    position: position ?? (await endOfStatus(m.tx, to.id)),
    completedAt: isDone ? (wasDone ? (task.completedAt ?? m.now) : m.now) : null,
    updatedAt: m.now,
  };
}
