import type { StatusSnapshot } from '@kite/shared';
import { and, eq, inArray, max, min } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { positionAfter, positionBefore } from '../db/position.js';
import {
  sprintProjects,
  sprints,
  statuses,
  tags,
  tasks,
  users,
  workspaceMembers,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { activeMember } from '../auth/membership.js';

type StatusRow = typeof statuses.$inferSelect;

const invalidReference = (what: string) =>
  httpError(400, 'INVALID_REFERENCE', `${what} does not belong to this project or workspace`);

export const statusSnapshot = (s: StatusRow): StatusSnapshot => ({
  id: s.id,
  name: s.name,
  category: s.category,
});

export const sprintSnapshot = (s: Pick<typeof sprints.$inferSelect, 'id' | 'name' | 'number'>) => ({
  id: s.id,
  name: s.name,
  number: s.number,
});

export async function requireStatusIn(db: DbOrTx, projectId: string, statusId: string) {
  const [status] = await db
    .select()
    .from(statuses)
    .where(and(eq(statuses.id, statusId), eq(statuses.projectId, projectId)));
  if (!status) throw invalidReference('Status');
  return status;
}

/** Whether the sprint covers the project (share-locked like `requireSprintIn`). */
export async function sprintCovers(db: DbOrTx, sprintId: string, projectId: string) {
  const rows = await db
    .select({ id: sprintProjects.sprintId })
    .from(sprintProjects)
    .where(and(eq(sprintProjects.sprintId, sprintId), eq(sprintProjects.projectId, projectId)))
    .for('share');
  return rows.length > 0;
}

/**
 * A sprint covering the project. Share-locks it, so an edit removing the project (or a delete)
 * waits for the transaction putting the task in.
 */
export async function requireSprintIn(db: DbOrTx, projectId: string, sprintId: string) {
  const [row] = await db
    .select({ sprint: sprints })
    .from(sprints)
    .innerJoin(
      sprintProjects,
      and(eq(sprintProjects.sprintId, sprints.id), eq(sprintProjects.projectId, projectId)),
    )
    .where(eq(sprints.id, sprintId))
    .for('share');
  if (!row) throw invalidReference('Sprint');
  return row.sprint;
}

/** Users by id, all of whom must be members of the workspace; by name. */
export async function requireMembers(
  db: DbOrTx,
  workspaceId: string,
  ids: readonly string[],
  what = 'Assignee',
) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), inArray(users.id, unique), activeMember),
    )
    .orderBy(users.name);
  if (rows.length !== unique.length) throw invalidReference(what);
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
