import { formatTaskKey, type FeedbackActivityData, type FeedbackStatus } from '@kite/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx, Tx } from '../db/client.js';
import { feedback, feedbackActivity, projects, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';

type FeedbackRow = typeof feedback.$inferSelect;
export interface TaskSnapshot {
  id: string;
  key: string;
  title: string;
}

/** Who and when, for the activity rows of one feedback change. */
export interface FeedbackChange {
  tx: Tx;
  actorId: string | null;
  now: Date;
}

export async function logFeedback(
  { tx, actorId, now }: FeedbackChange,
  feedbackId: string,
  kind: (typeof feedbackActivity.$inferInsert)['kind'],
  data: FeedbackActivityData = {},
  text: string | null = null,
) {
  await tx
    .insert(feedbackActivity)
    .values({ feedbackId, actorId, kind, data, text, createdAt: now });
}

/** Feedback rows of a workspace, locked for the rest of the transaction; 404 if one is missing. */
export async function lockFeedback(tx: Tx, workspaceId: string, ids: readonly string[]) {
  const rows = await tx
    .select()
    .from(feedback)
    .where(and(eq(feedback.workspaceId, workspaceId), inArray(feedback.id, [...ids])))
    .orderBy(feedback.id)
    .for('update');
  if (rows.length !== new Set(ids).size) throw httpError(404, 'NOT_FOUND', 'Feedback not found');
  return rows;
}

/** `{id, key, title}` of tasks (deleted ones too: the log keeps what they were). */
export async function taskSnapshots(db: DbOrTx, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, TaskSnapshot>();
  const rows = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, key: projects.key })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(inArray(tasks.id, [...ids]));
  return new Map(
    rows.map((r) => [r.id, { id: r.id, key: formatTaskKey(r.key, r.number), title: r.title }]),
  );
}

/** A live task of the workspace as a snapshot; 404 otherwise. */
export async function requireLinkableTask(db: DbOrTx, workspaceId: string, taskId: string) {
  const [row] = await db
    .select({ id: tasks.id, number: tasks.number, title: tasks.title, key: projects.key })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(eq(tasks.id, taskId), eq(projects.workspaceId, workspaceId)))
    .limit(1);
  const [live] = row
    ? await db.select({ deletedAt: tasks.deletedAt }).from(tasks).where(eq(tasks.id, taskId))
    : [];
  if (!row || !live || live.deletedAt) throw httpError(404, 'NOT_FOUND', 'Task not found');
  return { id: row.id, key: formatTaskKey(row.key, row.number), title: row.title };
}

/**
 * Sets a feedback's status (logs `status_change`; no-op when unchanged). Changing the status
 * also marks it read: somebody has looked at it.
 */
export async function setStatus(c: FeedbackChange, row: FeedbackRow, status: FeedbackStatus) {
  if (row.status === status) return false;
  await c.tx
    .update(feedback)
    .set({ status, isRead: true, updatedAt: c.now })
    .where(eq(feedback.id, row.id));
  await logFeedback(c, row.id, 'status_change', { from: row.status, to: status });
  return true;
}

/**
 * Links a feedback to a task (one task per feedback: a link to another task replaces it, logging
 * `unlinked` first). `setLinked` also sets the status to Linked. Returns the task ids touched.
 */
export async function linkToTask(
  c: FeedbackChange,
  row: FeedbackRow,
  task: TaskSnapshot,
  { setLinked = true } = {},
): Promise<string[]> {
  const status = setLinked ? 'linked' : row.status;
  if (row.taskId === task.id) {
    if (row.status === status) return [];
    await setStatus(c, row, status);
    return [task.id];
  }
  const touched = [task.id];
  if (row.taskId) {
    const old = (await taskSnapshots(c.tx, [row.taskId])).get(row.taskId);
    if (old) await logFeedback(c, row.id, 'unlinked', { task: old });
    touched.push(row.taskId);
  }
  await c.tx
    .update(feedback)
    .set({ taskId: task.id, status, isRead: true, updatedAt: c.now })
    .where(eq(feedback.id, row.id));
  await logFeedback(c, row.id, 'linked', {
    task,
    ...(status !== row.status ? { statusSet: true, from: row.status, to: status } : {}),
  });
  return touched;
}

/** Unlinks a feedback from its task and puts it back In review. Returns the old task id. */
export async function unlinkFromTask(
  c: FeedbackChange,
  row: FeedbackRow,
  reason?: 'task_deleted',
): Promise<string | null> {
  if (!row.taskId) return null;
  const old = (await taskSnapshots(c.tx, [row.taskId])).get(row.taskId);
  await c.tx
    .update(feedback)
    .set({ taskId: null, status: 'review', updatedAt: c.now })
    .where(eq(feedback.id, row.id));
  await logFeedback(c, row.id, 'unlinked', {
    ...(old ? { task: old } : {}),
    ...(row.status !== 'review' ? { from: row.status, to: 'review' as const } : {}),
    ...(reason ? { reason } : {}),
  });
  return row.taskId;
}

/**
 * Deleting a task unlinks its feedback (the feedback stays). Runs in the delete's transaction;
 * returns the workspace's affected feedback count.
 */
export async function unlinkFeedbackOfTasks(
  tx: Tx,
  actorId: string,
  now: Date,
  taskIds: readonly string[],
) {
  const c: FeedbackChange = { tx, actorId, now };
  if (taskIds.length === 0) return 0;
  const rows = await c.tx
    .select()
    .from(feedback)
    .where(inArray(feedback.taskId, [...taskIds]))
    .orderBy(feedback.id)
    .for('update');
  for (const row of rows) await unlinkFromTask(c, row, 'task_deleted');
  return rows.length;
}

/**
 * Restoring a deleted task (Undo) links back the feedback that its deletion unlinked, unless
 * someone has changed that feedback since (its latest log row must be that unlink).
 */
export async function relinkFeedbackOfTasks(
  tx: Tx,
  actorId: string,
  now: Date,
  taskIds: readonly string[],
) {
  const c: FeedbackChange = { tx, actorId, now };
  let relinked = 0;
  const snapshots = await taskSnapshots(c.tx, taskIds);
  for (const task of snapshots.values()) {
    const rows = await c.tx
      .select()
      .from(feedback)
      .where(
        and(
          isNull(feedback.taskId),
          sql`exists (
            select 1 from (
              select a.kind, a.data from feedback_activity a
              where a.feedback_id = ${feedback.id}
              order by a.created_at desc, a.id desc limit 1
            ) latest
            where latest.kind = 'unlinked'
              and latest.data->>'reason' = 'task_deleted'
              and latest.data->'task'->>'id' = ${task.id})`,
        ),
      )
      .orderBy(feedback.id)
      .for('update');
    for (const row of rows) {
      await linkToTask(c, row, task);
      relinked += 1;
    }
  }
  return relinked;
}

/** Tells the workspace's tabs to refetch the inbox, the sidebar count and these tasks' feedback. */
export function broadcastFeedbackChanged(
  app: FastifyInstance,
  {
    workspaceId,
    actorId,
    taskIds = [],
    clientId,
  }: {
    workspaceId: string;
    actorId: string | null;
    taskIds?: readonly string[];
    clientId?: string;
  },
) {
  app.realtime.broadcaster.publish({
    to: { workspaceId },
    exceptClientId: clientId,
    message: {
      type: 'feedback.changed',
      workspaceId,
      actorId,
      taskIds: [...new Set(taskIds)],
      at: new Date().toISOString(),
    },
  });
}
