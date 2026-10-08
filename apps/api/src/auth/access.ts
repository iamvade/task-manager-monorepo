import type { WorkspaceRole } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { projects, spaces, workspaceMembers } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { requireAuth } from './plugin.js';

const ROLE_RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

export const roleAtLeast = (role: WorkspaceRole, min: WorkspaceRole): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[min];

function checkRole(role: WorkspaceRole, minRole: WorkspaceRole): void {
  if (!roleAtLeast(role, minRole)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
}

/**
 * The caller's membership in a workspace. Non-members get 404 (we don't confirm the workspace
 * exists); members below `minRole` get 403.
 */
export async function requireWorkspaceMember(
  request: FastifyRequest,
  workspaceId: string,
  minRole: WorkspaceRole = 'member',
) {
  const { user } = requireAuth(request);
  const [membership] = await request.server.db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);
  if (!membership) throw httpError(404, 'NOT_FOUND', 'Workspace not found');
  checkRole(membership.role, minRole);
  return membership;
}

/**
 * Resolves project → space → workspace and checks the caller is a member of that workspace.
 * 404 when the project doesn't exist or belongs to a workspace the caller isn't in.
 */
export async function loadProjectAccess(
  request: FastifyRequest,
  projectId: string,
  minRole: WorkspaceRole = 'member',
) {
  const { user } = requireAuth(request);
  const [row] = await request.server.db
    .select({ project: projects, space: spaces, role: workspaceMembers.role })
    .from(projects)
    .innerJoin(
      spaces,
      and(eq(spaces.id, projects.spaceId), eq(spaces.workspaceId, projects.workspaceId)),
    )
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, spaces.workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    )
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Project not found');
  checkRole(row.role, minRole);
  return { ...row, workspaceId: row.space.workspaceId };
}
