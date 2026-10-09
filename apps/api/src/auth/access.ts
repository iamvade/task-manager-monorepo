import type { WorkspaceRole } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import {
  attachments,
  comments,
  projects,
  spaces,
  subtasks,
  tags,
  tasks,
  workspaceMembers,
} from '../db/schema/index.js';
import { HttpError, httpError } from '../errors.js';
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

/** The caller's role in `workspaceId`, or 404 — the shared tail of the `load*Access` helpers. */
async function roleIn(request: FastifyRequest, workspaceId: string, what: string) {
  const { user } = requireAuth(request);
  const [membership] = await request.server.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, user.id)))
    .limit(1);
  if (!membership) throw httpError(404, 'NOT_FOUND', `${what} not found`);
  return membership.role;
}

/** A space in a workspace the caller belongs to; 404 otherwise. */
export async function loadSpaceAccess(
  request: FastifyRequest,
  spaceId: string,
  minRole: WorkspaceRole = 'member',
) {
  requireAuth(request);
  const [space] = await request.server.db
    .select()
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .limit(1);
  if (!space) throw httpError(404, 'NOT_FOUND', 'Space not found');
  const role = await roleIn(request, space.workspaceId, 'Space');
  checkRole(role, minRole);
  return { space, role };
}

/** A tag in a workspace the caller belongs to; 404 otherwise. */
export async function loadTagAccess(
  request: FastifyRequest,
  tagId: string,
  minRole: WorkspaceRole = 'member',
) {
  requireAuth(request);
  const [tag] = await request.server.db.select().from(tags).where(eq(tags.id, tagId)).limit(1);
  if (!tag) throw httpError(404, 'NOT_FOUND', 'Tag not found');
  const role = await roleIn(request, tag.workspaceId, 'Tag');
  checkRole(role, minRole);
  return { tag, role };
}

/**
 * A task in a workspace the caller belongs to, with its project; 404 otherwise. Soft-deleted
 * tasks are 404 too unless `includeDeleted`.
 */
export async function loadTaskAccess(
  request: FastifyRequest,
  taskId: string,
  { includeDeleted = false } = {},
) {
  const { user } = requireAuth(request);
  const [row] = await request.server.db
    .select({ task: tasks, project: projects, role: workspaceMembers.role })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, projects.workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    )
    .where(eq(tasks.id, taskId))
    .limit(1);
  if (!row || (row.task.deletedAt && !includeDeleted)) {
    throw httpError(404, 'NOT_FOUND', 'Task not found');
  }
  return { ...row, workspaceId: row.project.workspaceId };
}

/** A subtask of a live task the caller can see; 404 otherwise. */
export async function loadSubtaskAccess(request: FastifyRequest, subtaskId: string) {
  const [subtask] = await request.server.db
    .select()
    .from(subtasks)
    .where(eq(subtasks.id, subtaskId))
    .limit(1);
  if (!subtask) throw httpError(404, 'NOT_FOUND', 'Subtask not found');
  return { ...(await childTaskAccess(request, subtask.taskId, 'Subtask')), subtask };
}

/** A live comment on a live task the caller can see; 404 otherwise. */
export async function loadCommentAccess(request: FastifyRequest, commentId: string) {
  const [comment] = await request.server.db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!comment || comment.deletedAt) throw httpError(404, 'NOT_FOUND', 'Comment not found');
  return { ...(await childTaskAccess(request, comment.taskId, 'Comment')), comment };
}

/** An attachment of a live task the caller can see; 404 otherwise. */
export async function loadAttachmentAccess(request: FastifyRequest, attachmentId: string) {
  const [attachment] = await request.server.db
    .select()
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!attachment) throw httpError(404, 'NOT_FOUND', 'Attachment not found');
  return { ...(await childTaskAccess(request, attachment.taskId, 'Attachment')), attachment };
}

/** `loadTaskAccess` for a task's child row; the 404 names the child, not the task. */
async function childTaskAccess(request: FastifyRequest, taskId: string, what: string) {
  try {
    return await loadTaskAccess(request, taskId);
  } catch (err) {
    if (err instanceof HttpError && err.statusCode === 404) {
      throw httpError(404, 'NOT_FOUND', `${what} not found`);
    }
    throw err;
  }
}

/**
 * The id of the task with key `projectKey-number` among the caller's workspaces (or only in
 * `workspaceId`). Keys are unique per workspace, so a key found in several of the caller's
 * workspaces is 409 `TASK_KEY_AMBIGUOUS`.
 */
export async function findTaskIdByKey(
  request: FastifyRequest,
  { key, number }: { key: string; number: number },
  workspaceId?: string,
): Promise<string> {
  const { user } = requireAuth(request);
  const rows = await request.server.db
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, projects.workspaceId),
        eq(workspaceMembers.userId, user.id),
      ),
    )
    .where(
      and(
        eq(projects.key, key),
        eq(tasks.number, number),
        workspaceId ? eq(projects.workspaceId, workspaceId) : undefined,
      ),
    )
    .limit(2);
  const [first, second] = rows;
  if (!first) throw httpError(404, 'NOT_FOUND', 'Task not found');
  if (second) {
    throw httpError(
      409,
      'TASK_KEY_AMBIGUOUS',
      'This key exists in several of your workspaces; pass workspaceId',
    );
  }
  return first.id;
}
