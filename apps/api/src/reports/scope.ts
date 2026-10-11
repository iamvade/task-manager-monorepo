import {
  REPORT_MIN_COMPLETED,
  todayInZone,
  type ReportScope,
  type WorkspaceRole,
} from '@kite/shared';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { requireWorkspaceMember } from '../auth/access.js';
import { requireAuth, type UserRow } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import { projects, spaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { alias, rows } from './sql.js';

/** Who is asking, for which scope, and "now" in their time zone. */
export interface ReportContext {
  user: UserRow;
  role: WorkspaceRole;
  workspaceId: string;
  spaceId: string | null;
  projectId: string | null;
  timezone: string;
  today: string;
  now: Date;
}

/**
 * Checks the caller is a member of the workspace (404 otherwise) and that the space/project
 * filters belong to it (404 otherwise, as does a project outside the given space).
 */
export async function resolveReportScope(
  request: FastifyRequest,
  workspaceId: string,
  filters: { spaceId?: string | undefined; projectId?: string | undefined } = {},
): Promise<ReportContext> {
  const { user } = requireAuth(request);
  const membership = await requireWorkspaceMember(request, workspaceId);
  const db = request.server.db;
  const spaceId = filters.spaceId ?? null;
  const projectId = filters.projectId ?? null;
  if (spaceId) {
    const [space] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), eq(spaces.workspaceId, workspaceId)))
      .limit(1);
    if (!space) throw httpError(404, 'NOT_FOUND', 'Space not found');
  }
  if (projectId) {
    const [project] = await db
      .select({ id: projects.id, spaceId: projects.spaceId })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
      .limit(1);
    if (!project || (spaceId && project.spaceId !== spaceId)) {
      throw httpError(404, 'NOT_FOUND', 'Project not found');
    }
  }
  const now = request.server.clock();
  return {
    user,
    role: membership.role,
    workspaceId,
    spaceId,
    projectId,
    timezone: user.timezone,
    today: todayInZone(user.timezone, now),
    now,
  };
}

export const scopeDto = (ctx: ReportContext): ReportScope => ({
  workspaceId: ctx.workspaceId,
  spaceId: ctx.spaceId,
  projectId: ctx.projectId,
});

/** Ids of the non-archived projects in the scope, as a subquery. */
export const scopedProjectIds = (ctx: ReportContext) => sql`(
  select sp.id from projects sp
  where sp.workspace_id = ${ctx.workspaceId} and sp.archived_at is null
  ${ctx.spaceId ? sql`and sp.space_id = ${ctx.spaceId}` : sql``}
  ${ctx.projectId ? sql`and sp.id = ${ctx.projectId}` : sql``}
)`;

/** Condition: task row `t` counts for the scope (live task of a non-archived scoped project). */
export const taskInScope = (ctx: ReportContext, t: string) =>
  sql`${alias(t)}.deleted_at is null and ${alias(t)}.project_id in ${scopedProjectIds(ctx)}`;

/** Completed tasks in the scope, all time (the empty state's "x / 5"). */
export const historyQuery = (ctx: ReportContext) =>
  sql`select count(*)::int as completed from tasks t
    where ${taskInScope(ctx, 't')} and t.completed_at is not null`;

export async function loadHistory(db: DbOrTx, ctx: ReportContext) {
  const [row] = await rows<{ completed: number }>(db, historyQuery(ctx));
  return { completed: row?.completed ?? 0, required: REPORT_MIN_COMPLETED };
}
