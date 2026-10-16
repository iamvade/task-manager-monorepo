import type { WorkspaceMember } from '@kite/shared';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { upcomingAbsences } from '../absences/query.js';
import { activeMember } from '../auth/membership.js';
import { projectMembers, users, workspaceMembers } from '../db/schema/index.js';

/** Members of a workspace, or of one of its projects (`projectId`), by name. */
export async function listMembers(
  db: DbOrTx,
  workspaceId: string,
  filter: { projectId?: string; userId?: string; includeDeactivated?: boolean } = {},
): Promise<WorkspaceMember[]> {
  const conditions: SQL[] = [eq(workspaceMembers.workspaceId, workspaceId)];
  if (!filter.includeDeactivated) conditions.push(activeMember);
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
      capacityPoints: workspaceMembers.capacityPoints,
      joinedAt: workspaceMembers.joinedAt,
      deactivatedAt: workspaceMembers.deactivatedAt,
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
  const absences = await upcomingAbsences(
    db,
    rows.map((r) => r.id),
  );
  return rows.map(({ role, title, capacityPoints, joinedAt, deactivatedAt, ...user }) => ({
    user,
    role,
    title,
    capacityPoints,
    joinedAt: joinedAt.toISOString(),
    absences: absences.get(user.id) ?? [],
    deactivatedAt: deactivatedAt?.toISOString() ?? null,
  }));
}
