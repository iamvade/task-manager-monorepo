import { canManageCreated, canManageStandupGroup, type WorkspaceRole } from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import {
  attachments,
  comments,
  feedback,
  projects,
  spaces,
  sprints,
  standupBlockers,
  standupEntries,
  standupGroupMembers,
  standupGroups,
  standupReplies,
  userAbsences,
  subtasks,
  tags,
  tasks,
  workspaceMembers,
} from '../db/schema/index.js';
import { HttpError, httpError } from '../errors.js';
import { requireAuth } from './plugin.js';
import { activeMember } from './membership.js';

const ROLE_RANK: Record<WorkspaceRole, number> = { member: 0, admin: 1, owner: 2 };

export const roleAtLeast = (role: WorkspaceRole, min: WorkspaceRole): boolean =>
  ROLE_RANK[role] >= ROLE_RANK[min];

/** 403 for a member below `minRole`, for checks that depend on the request body. */
export function requireRole(role: WorkspaceRole, minRole: WorkspaceRole): void {
  checkRole(role, minRole);
}

function checkRole(role: WorkspaceRole, minRole: WorkspaceRole): void {
  if (!roleAtLeast(role, minRole)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
}

/**
 * Archive/restore a project, delete an empty space: admins and owners, or the member who created
 * it (`canManageCreated` in packages/shared, which the web uses to show the actions). 403 else.
 */
export function requireCreatorOrAdmin(
  request: FastifyRequest,
  role: WorkspaceRole,
  createdBy: string | null,
): void {
  if (!canManageCreated(role, createdBy, requireAuth(request).user.id)) checkRole(role, 'admin');
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
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
        activeMember,
      ),
    )
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
        activeMember,
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
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id),
        activeMember,
      ),
    )
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

/** A feedback item in a workspace the caller belongs to (every member triages); 404 otherwise. */
export async function loadFeedbackAccess(request: FastifyRequest, feedbackId: string) {
  requireAuth(request);
  const [row] = await request.server.db
    .select()
    .from(feedback)
    .where(eq(feedback.id, feedbackId))
    .limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Feedback not found');
  const role = await roleIn(request, row.workspaceId, 'Feedback');
  return { feedback: row, role, workspaceId: row.workspaceId };
}

/** A sprint in a workspace the caller belongs to; 404 otherwise. */
export async function loadSprintAccess(request: FastifyRequest, sprintId: string) {
  requireAuth(request);
  const [sprint] = await request.server.db
    .select()
    .from(sprints)
    .where(eq(sprints.id, sprintId))
    .limit(1);
  if (!sprint) throw httpError(404, 'NOT_FOUND', 'Sprint not found');
  const role = await roleIn(request, sprint.workspaceId, 'Sprint');
  return { sprint, role };
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
        activeMember,
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
        activeMember,
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

/**
 * A standup group in a workspace the caller belongs to (every member sees every group); 404
 * otherwise. `manage` also requires admin/owner or the group's facilitator (403). `member`
 * requires being in the group: standup content (updates, blockers, reactions, replies) is for
 * the group's members only, admins included (403).
 */
export async function loadStandupGroupAccess(
  request: FastifyRequest,
  groupId: string,
  { manage = false, member = false } = {},
) {
  const { user } = requireAuth(request);
  const [group] = await request.server.db
    .select()
    .from(standupGroups)
    .where(eq(standupGroups.id, groupId))
    .limit(1);
  if (!group) throw httpError(404, 'NOT_FOUND', 'Standup group not found');
  const role = await roleIn(request, group.workspaceId, 'Standup group');
  if (manage && !canManageStandupGroup(role, group.facilitatorId, user.id)) {
    throw httpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
  if (member) await requireStandupGroupMember(request, group.id);
  return { group, role };
}

async function requireStandupGroupMember(request: FastifyRequest, groupId: string) {
  const { user } = requireAuth(request);
  const [row] = await request.server.db
    .select({ userId: standupGroupMembers.userId })
    .from(standupGroupMembers)
    .where(and(eq(standupGroupMembers.groupId, groupId), eq(standupGroupMembers.userId, user.id)))
    .limit(1);
  if (!row) throw httpError(403, 'FORBIDDEN', 'Only members of this standup group can see it');
}

/** A standup update and its group, for group members (404 / 403 as `loadStandupGroupAccess`). */
export async function loadStandupEntryAccess(request: FastifyRequest, entryId: string) {
  const [entry] = await request.server.db
    .select()
    .from(standupEntries)
    .where(eq(standupEntries.id, entryId))
    .limit(1);
  if (!entry) throw httpError(404, 'NOT_FOUND', 'Standup update not found');
  const { user } = requireAuth(request);
  // Someone else's draft doesn't exist for the caller.
  if (entry.status !== 'posted' && entry.userId !== user.id) {
    throw httpError(404, 'NOT_FOUND', 'Standup update not found');
  }
  const access = await loadStandupGroupAccess(request, entry.groupId, { member: true });
  return { ...access, entry };
}

/** A blocker of a posted update, for group members. */
export async function loadStandupBlockerAccess(request: FastifyRequest, blockerId: string) {
  const [row] = await request.server.db
    .select({ blocker: standupBlockers, entryId: standupEntries.id })
    .from(standupBlockers)
    .innerJoin(standupEntries, eq(standupEntries.id, standupBlockers.entryId))
    .where(and(eq(standupBlockers.id, blockerId), eq(standupEntries.status, 'posted')))
    .limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Blocker not found');
  return { ...(await loadStandupEntryAccess(request, row.entryId)), blocker: row.blocker };
}

/** A reply on a standup update, for group members. */
export async function loadStandupReplyAccess(request: FastifyRequest, replyId: string) {
  const [reply] = await request.server.db
    .select()
    .from(standupReplies)
    .where(eq(standupReplies.id, replyId))
    .limit(1);
  if (!reply) throw httpError(404, 'NOT_FOUND', 'Reply not found');
  return { ...(await loadStandupEntryAccess(request, reply.entryId)), reply };
}

/**
 * An absence of someone in `workspaceId` (404 otherwise, also when the caller isn't a member).
 * Changing it is for the person themselves or the workspace's admins/owner (403).
 */
export async function loadAbsenceAccess(
  request: FastifyRequest,
  workspaceId: string,
  absenceId: string,
) {
  const { user } = requireAuth(request);
  const caller = await requireWorkspaceMember(request, workspaceId);
  const [row] = await request.server.db
    .select({ absence: userAbsences })
    .from(userAbsences)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, userAbsences.userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .where(eq(userAbsences.id, absenceId))
    .limit(1);
  if (!row) throw httpError(404, 'NOT_FOUND', 'Absence not found');
  if (row.absence.userId !== user.id) checkRole(caller.role, 'admin');
  return row.absence;
}
