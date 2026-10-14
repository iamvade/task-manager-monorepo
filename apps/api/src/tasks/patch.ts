import type { updateTaskSchema } from '@kite/shared';
import { extractMentionIds, richTextToPlain } from '@kite/shared';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { taskAssignees, tasks, users } from '../db/schema/index.js';
import { follow, workspaceMemberIds } from './followers.js';
import { stableJson } from './json.js';
import type { TaskMutation, TaskRow } from './mutation.js';
import { syncReferences } from './references.js';
import { requireMembers, requireSprintIn, requireStatusIn } from './refs.js';
import { setSprint } from './sprint.js';
import { changeStatus } from './status.js';

export type TaskPatch = z.output<typeof updateTaskSchema>;

/**
 * Applies a `PATCH /tasks/:id` body to a locked task inside `mutateTasks` (also used by the
 * batch route): one activity row per changed field, unchanged values ignored, then one
 * `task.updated` event. Returns whether anything changed.
 */
export async function applyTaskPatch(
  m: TaskMutation,
  task: TaskRow,
  body: Partial<TaskPatch>,
): Promise<boolean> {
  const { tx } = m;
  const patch: Partial<typeof tasks.$inferInsert> = {};
  let mentioned: string[] = [];

  if (body.title !== undefined && body.title !== task.title) {
    patch.title = body.title;
    m.log(task.id, 'title.changed', { from: task.title, to: body.title });
  }
  if (
    body.description !== undefined &&
    stableJson(body.description) !== stableJson(task.description)
  ) {
    patch.description = body.description;
    patch.descriptionText = body.description ? richTextToPlain(body.description) : '';
    m.log(task.id, 'description.changed', {});
    const before = new Set(extractMentionIds(task.description));
    mentioned = await workspaceMemberIds(
      tx,
      m.project.workspaceId,
      extractMentionIds(body.description).filter((id) => !before.has(id)),
    );
    await follow(tx, task.id, mentioned);
  }
  if (body.priority !== undefined && body.priority !== task.priority) {
    patch.priority = body.priority;
    m.log(task.id, 'priority.changed', { from: task.priority, to: body.priority });
  }
  if (body.size !== undefined && body.size !== task.size) {
    patch.size = body.size;
    m.log(task.id, 'size.changed', { from: task.size, to: body.size });
  }
  let reviewerId = task.reviewerId;
  if (body.reviewerId !== undefined && body.reviewerId !== task.reviewerId) {
    const [to] = body.reviewerId
      ? await requireMembers(tx, m.project.workspaceId, [body.reviewerId], 'Reviewer')
      : [];
    const [from] = task.reviewerId
      ? await tx
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(eq(users.id, task.reviewerId))
      : [];
    reviewerId = patch.reviewerId = to?.id ?? null;
    m.log(task.id, 'reviewer.changed', { from: from ?? null, to: to ?? null });
  }
  if (body.startDate !== undefined && body.startDate !== task.startDate) {
    patch.startDate = body.startDate;
    m.log(task.id, 'start.changed', { from: task.startDate, to: body.startDate });
  }
  if (body.dueDate !== undefined && body.dueDate !== task.dueDate) {
    patch.dueDate = body.dueDate;
    m.log(task.id, 'due.changed', { from: task.dueDate, to: body.dueDate });
  }
  if (body.sprintId !== undefined && body.sprintId !== task.sprintId) {
    const to = body.sprintId ? await requireSprintIn(tx, task.projectId, body.sprintId) : null;
    Object.assign(patch, await setSprint(m, task, to));
  }
  if (body.statusId !== undefined && body.statusId !== task.statusId) {
    const to = await requireStatusIn(tx, task.projectId, body.statusId);
    const from = await requireStatusIn(tx, task.projectId, task.statusId);
    Object.assign(
      patch,
      await changeStatus(m, { ...task, reviewerId }, from, to, {
        // An explicit `reviewerId: null` keeps the task without a reviewer.
        ...(body.reviewerId === null ? { reviewer: null } : {}),
      }),
    );
  }

  if (Object.keys(patch).length === 0) return false;
  await tx
    .update(tasks)
    .set({ ...patch, updatedAt: m.now })
    .where(eq(tasks.id, task.id));
  if (patch.title !== undefined || patch.descriptionText !== undefined) {
    await syncReferences(
      tx,
      { taskId: task.id, workspaceId: m.project.workspaceId },
      `${patch.title ?? task.title}\n${patch.descriptionText ?? task.descriptionText}`,
    );
  }
  m.emit('task.updated', task.id, mentioned.length > 0 ? { mentionedUserIds: mentioned } : {});
  return true;
}

/**
 * Replaces a locked task's assignees (`PUT /tasks/:id/assignees`, the batch route, handovers):
 * every user must be a workspace member, `assignee.added` / `assignee.removed` per change, new
 * assignees follow the task, one `task.updated` event. Returns whether anything changed.
 */
export async function setTaskAssignees(
  m: TaskMutation,
  task: TaskRow,
  userIds: readonly string[],
): Promise<boolean> {
  const { tx } = m;
  const next = await requireMembers(tx, m.project.workspaceId, [...userIds]);
  const current = await tx
    .select({ id: users.id, name: users.name })
    .from(taskAssignees)
    .innerJoin(users, eq(users.id, taskAssignees.userId))
    .where(eq(taskAssignees.taskId, task.id))
    .orderBy(users.name);
  const nextIds = new Set(next.map((u) => u.id));
  const currentIds = new Set(current.map((u) => u.id));
  const removed = current.filter((u) => !nextIds.has(u.id));
  const added = next.filter((u) => !currentIds.has(u.id));
  if (removed.length === 0 && added.length === 0) return false;

  if (removed.length > 0) {
    await tx.delete(taskAssignees).where(
      and(
        eq(taskAssignees.taskId, task.id),
        inArray(
          taskAssignees.userId,
          removed.map((u) => u.id),
        ),
      ),
    );
  }
  if (added.length > 0) {
    await tx.insert(taskAssignees).values(added.map((u) => ({ taskId: task.id, userId: u.id })));
    await follow(
      tx,
      task.id,
      added.map((u) => u.id),
    );
  }
  for (const user of removed) m.log(task.id, 'assignee.removed', { user });
  for (const user of added) m.log(task.id, 'assignee.added', { user });
  await tx.update(tasks).set({ updatedAt: m.now }).where(eq(tasks.id, task.id));
  m.emit('task.updated', task.id);
  return true;
}
