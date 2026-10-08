import type { WorkspaceMember } from '@kite/shared';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { projectMembers, users, workspaceMembers } from '../db/schema/index.js';

/** Members of a workspace, or of one of its projects (`projectId`), by name. */
export async function listMembers(
  db: DbOrTx,
  workspaceId: string,
  filter: { projectId?: string; userId?: string } = {},
): Promise<WorkspaceMember[]> {
  const conditions: SQL[] = [eq(workspaceMembers.workspaceId, workspaceId)];
  if (filter.userId) conditions.push(eq(workspaceMembers.userId, filter.userId));
  const base = db
    .select({
      id: users.id,
      name: users.name,
      initials: users.initials,
      avatarColor: users.avatarColor,
      email: users.email,
      role: workspaceMembers.role,
      title: workspaceMembers.title,
      joinedAt: workspaceMembers.joinedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .$dynamic();
  const query = filter.projectId
    ? base.innerJoin(
        projectMembers,
        and(
          eq(projectMembers.userId, workspaceMembers.userId),
          eq(projectMembers.projectId, filter.projectId),
        ),
      )
    : base;
  const rows = await query.where(and(...conditions)).orderBy(asc(users.name));
  return rows.map(({ role, title, joinedAt, ...user }) => ({
    user,
    role,
    title,
    joinedAt: joinedAt.toISOString(),
  }));
}
