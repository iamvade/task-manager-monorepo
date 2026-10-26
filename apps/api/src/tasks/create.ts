import { extractMentionIds, richTextToPlain, type CreateTask } from '@kite/shared';
import { eq } from 'drizzle-orm';
import { one } from '../db/rows.js';
import { projects, taskAssignees, taskTags, tasks } from '../db/schema/index.js';
import { listStatuses } from '../projects/statuses.js';
import { follow, workspaceMemberIds } from './followers.js';
import type { TaskMutation } from './mutation.js';
import { syncReferences } from './references.js';
import {
  endOfStatus,
  requireMembers,
  requireSprintIn,
  requireStatusIn,
  requireTags,
  startOfStatus,
  statusSnapshot,
} from './refs.js';
import { startInSprint } from './sprint.js';
import { closureStamps, openStatusPeriods, projectLead } from './status.js';

/**
 * Creates a task in the mutation's (locked) project under its next number, as the actor:
 * `POST /projects/:id/tasks` and "Create task from feedback". Logs `task.created`, opens the
 * status period and sprint membership, makes the creator, assignees and @mentioned members
 * followers, and emits `task.created`. Returns the new task's id.
 */
export async function createTask(
  m: TaskMutation,
  body: CreateTask,
  { id }: { id?: string } = {},
): Promise<string> {
  const { tx } = m;
  const workspaceId = m.project.workspaceId;
  const statusRows = await listStatuses(tx, m.project.id);
  const status = body.statusId
    ? await requireStatusIn(tx, m.project.id, body.statusId)
    : (statusRows.find((s) => s.category === 'todo') ?? statusRows[0]);
  if (!status) throw new Error(`Project ${m.project.id} has no statuses`);
  const sprint = body.sprintId ? await requireSprintIn(tx, m.project.id, body.sprintId) : null;
  const reviewer = status.category === 'review' ? await projectLead(tx, m.project) : null;
  const assignees = await requireMembers(tx, workspaceId, body.assigneeIds ?? []);
  const tagRows = await requireTags(tx, workspaceId, body.tagIds ?? []);

  // The project row is locked, so this number is ours.
  const number = m.project.taskSeq + 1;
  await tx.update(projects).set({ taskSeq: number }).where(eq(projects.id, m.project.id));
  const description = body.description ?? null;
  const task = one(
    await tx
      .insert(tasks)
      .values({
        ...(id ? { id } : {}),
        projectId: m.project.id,
        number,
        statusId: status.id,
        sprintId: body.sprintId ?? null,
        title: body.title,
        description,
        descriptionText: description ? richTextToPlain(description) : '',
        priority: body.priority ?? 'none',
        size: body.size ?? null,
        reviewerId: reviewer?.id ?? null,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        position:
          body.position === 'top'
            ? await startOfStatus(tx, status.id)
            : await endOfStatus(tx, status.id),
        createdBy: m.actorId,
        ...closureStamps(null, status.category, m.now),
        createdAt: m.now,
        updatedAt: m.now,
      })
      .returning({ id: tasks.id }),
    'task',
  );
  if (assignees.length > 0) {
    await tx
      .insert(taskAssignees)
      .values(assignees.map((a) => ({ taskId: task.id, userId: a.id })));
  }
  if (tagRows.length > 0) {
    await tx.insert(taskTags).values(tagRows.map((t) => ({ taskId: task.id, tagId: t.id })));
  }
  const mentioned = await workspaceMemberIds(tx, workspaceId, extractMentionIds(description));
  await follow(tx, task.id, [m.actorId, ...assignees.map((a) => a.id), ...mentioned]);
  await syncReferences(
    tx,
    { taskId: task.id, workspaceId },
    `${body.title}\n${description ? richTextToPlain(description) : ''}`,
  );

  m.log(task.id, 'task.created', { status: statusSnapshot(status) });
  await openStatusPeriods(tx, [{ taskId: task.id, status, at: m.now, actorId: m.actorId }]);
  if (sprint) await startInSprint(m, task.id, sprint);
  if (reviewer) m.log(task.id, 'reviewer.changed', { from: null, to: reviewer });
  m.emit('task.created', task.id, {
    assigneeIds: assignees.map((a) => a.id),
    mentionedUserIds: mentioned,
  });
  return task.id;
}
