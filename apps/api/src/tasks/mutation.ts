import type { ActivityPayload, TaskActivityType, TaskEventType } from '@kite/shared';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { uuidv7 } from 'uuidv7';
import type { Tx } from '../db/client.js';
import { activity, projects, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import type { EventActivity, TaskEvent } from '../events/bus.js';

type ProjectRow = typeof projects.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
type TaskEventExtra = Pick<
  TaskEvent,
  'assigneeIds' | 'commentId' | 'mentionedUserIds' | 'subtaskId' | 'attachmentId'
>;
type ActivityInsert = typeof activity.$inferInsert & EventActivity & { taskId: string };

export interface TaskMutation {
  tx: Tx;
  /** One timestamp for the whole mutation (updated_at, completed_at, activity rows). */
  now: Date;
  actorId: string;
  /** The project, locked for the rest of the transaction. */
  project: ProjectRow;
  /** Another project locked through `alsoLock` (moves between projects). */
  locked(projectId: string): ProjectRow;
  /** Files the task's activity rows and events of this mutation under another project. */
  reassign(taskId: string, projectId: string): void;
  /** Re-reads and locks a task of this project; 404 when it's gone (or deleted, by default). */
  lockTask(taskId: string, opts?: { includeDeleted?: boolean }): Promise<TaskRow>;
  /** Records an activity row; all rows are inserted just before commit. */
  log<T extends TaskActivityType>(taskId: string, type: T, payload: ActivityPayload<T>): void;
  /** Queues a bus event, emitted after commit with the task's activity rows attached. */
  emit(type: TaskEventType, taskId: string, extra?: TaskEventExtra): void;
  /** Bumps the task's `updated_at` to `now` (sub-resource changes). */
  touch(taskId: string): Promise<void>;
}

/**
 * Runs a task mutation in one transaction. The project row is locked first (`FOR NO KEY
 * UPDATE`: it serializes task numbering and position allocation in the project without blocking
 * foreign-key checks), activity rows are written in the same transaction, and events go to the
 * bus only after commit — a rollback emits nothing.
 */
export async function mutateTasks<T>(
  app: FastifyInstance,
  {
    projectId,
    actorId,
    alsoLock = [],
  }: { projectId: string; actorId: string; alsoLock?: readonly string[] },
  run: (m: TaskMutation) => Promise<T>,
): Promise<T> {
  const now = new Date();
  const rows: ActivityInsert[] = [];
  const queued: Omit<TaskEvent, 'activities'>[] = [];
  const reassigned = new Map<string, string>();

  const result = await app.db.transaction(async (tx) => {
    // Several projects are locked in id order, so two opposite moves can't deadlock.
    const lockedRows = await tx
      .select()
      .from(projects)
      .where(inArray(projects.id, [...new Set([projectId, ...alsoLock])]))
      .orderBy(asc(projects.id))
      .for('no key update');
    const project = lockedRows.find((p) => p.id === projectId);
    if (!project) throw httpError(404, 'NOT_FOUND', 'Project not found');

    const m: TaskMutation = {
      tx,
      now,
      actorId,
      project,
      locked(id) {
        const row = lockedRows.find((p) => p.id === id);
        if (!row) throw httpError(404, 'NOT_FOUND', 'Project not found');
        return row;
      },
      reassign(taskId, toProjectId) {
        reassigned.set(taskId, toProjectId);
      },
      async lockTask(taskId, { includeDeleted = false } = {}) {
        const [task] = await tx
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.id, taskId),
              eq(tasks.projectId, projectId),
              includeDeleted ? undefined : isNull(tasks.deletedAt),
            ),
          )
          .for('no key update');
        if (!task) throw httpError(404, 'NOT_FOUND', 'Task not found');
        return task;
      },
      log(taskId, type, payload) {
        rows.push({
          id: uuidv7(),
          workspaceId: project.workspaceId,
          projectId,
          taskId,
          actorId,
          type,
          payload,
          createdAt: now,
        });
      },
      async touch(taskId) {
        await tx.update(tasks).set({ updatedAt: now }).where(eq(tasks.id, taskId));
      },
      emit(type, taskId, extra) {
        queued.push({
          type,
          workspaceId: project.workspaceId,
          projectId,
          taskId,
          actorId,
          at: now,
          ...extra,
        });
      },
    };

    const value = await run(m);
    for (const row of rows) row.projectId = reassigned.get(row.taskId) ?? row.projectId;
    if (rows.length > 0) await tx.insert(activity).values(rows);
    return value;
  });

  for (const event of queued) {
    app.events.emit({
      ...event,
      projectId: reassigned.get(event.taskId) ?? event.projectId,
      activities: rows
        .filter((r) => r.taskId === event.taskId)
        .map(({ id, type, payload }) => ({ id, type, payload })),
    });
  }
  return result;
}
