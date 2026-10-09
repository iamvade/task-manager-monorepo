import type { UserRef } from '@kite/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { taskFollowers, users, workspaceMembers } from '../db/schema/index.js';
import { userRefColumns } from './user-ref.js';

/** Makes users follow a task (already following is fine). */
export async function follow(db: DbOrTx, taskId: string, userIds: Iterable<string>) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  await db
    .insert(taskFollowers)
    .values(ids.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing();
}

export async function unfollow(db: DbOrTx, taskId: string, userId: string) {
  await db
    .delete(taskFollowers)
    .where(and(eq(taskFollowers.taskId, taskId), eq(taskFollowers.userId, userId)));
}

/** Followers of a task, by name. */
export function listFollowers(db: DbOrTx, taskId: string): Promise<UserRef[]> {
  return db
    .select(userRefColumns)
    .from(taskFollowers)
    .innerJoin(users, eq(users.id, taskFollowers.userId))
    .where(eq(taskFollowers.taskId, taskId))
    .orderBy(asc(users.name), asc(users.id));
}

/**
 * The ids among `ids` that belong to members of the workspace, in the given order. Mentions of
 * anyone else (stale or forged ids) are ignored rather than rejected.
 */
export async function workspaceMemberIds(
  db: DbOrTx,
  workspaceId: string,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, [...ids]),
      ),
    );
  const members = new Set(rows.map((r) => r.id));
  return ids.filter((id) => members.has(id));
}
