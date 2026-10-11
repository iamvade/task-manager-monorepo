import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { taskStatusPeriods, users, workspaceMembers, type statuses } from '../db/schema/index.js';
import type { TaskMutation, TaskRow } from './mutation.js';
import { endOfStatus, statusSnapshot } from './refs.js';

// The only code that changes `tasks.status_id`. Each status change closes the task's open
// status period and opens one for the new status in the same transaction; a deferred trigger
// (drizzle/0006_report_backfill.sql) rejects any commit where a task's status has no matching
// open period.

type StatusRow = typeof statuses.$inferSelect;

export interface PeriodStart {
  taskId: string;
  status: Pick<StatusRow, 'id' | 'category'>;
  at: Date;
  actorId: string;
}

/** Opens the first status period of new tasks (create, duplicate, template apply). */
export async function openStatusPeriods(db: DbOrTx, rows: readonly PeriodStart[]) {
  if (rows.length === 0) return;
  await db.insert(taskStatusPeriods).values(
    rows.map((r) => ({
      taskId: r.taskId,
      statusId: r.status.id,
      category: r.status.category,
      enteredAt: r.at,
      enteredBy: r.actorId,
    })),
  );
}

/** Closes the task's open period and opens one in `to`. */
async function switchPeriod(m: TaskMutation, taskId: string, to: StatusRow) {
  await m.tx
    .update(taskStatusPeriods)
    .set({ exitedAt: m.now, exitedBy: m.actorId })
    .where(and(eq(taskStatusPeriods.taskId, taskId), isNull(taskStatusPeriods.exitedAt)));
  await openStatusPeriods(m.tx, [{ taskId, status: to, at: m.now, actorId: m.actorId }]);
}

/** The project lead, while they are still a member of the project's workspace. */
export async function projectLead(
  db: DbOrTx,
  project: { workspaceId: string; leadId: string | null },
) {
  if (!project.leadId) return null;
  const [lead] = await db
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, project.workspaceId),
        eq(workspaceMembers.userId, project.leadId),
      ),
    );
  return lead ?? null;
}

export interface ChangeStatusOptions {
  /** Position in the new status; the end of it by default. */
  position?: string;
  /**
   * Who reviews when the task enters review without a reviewer: the person picked in the UI
   * (`null` = explicitly nobody), the project lead when omitted.
   */
  reviewer?: { id: string; name: string } | null;
}

/**
 * Moves `task` from status `from` to `to`: logs `status.changed`, switches the status period,
 * and returns the task columns to write. `completed_at` is set on entering a done status,
 * cleared on leaving one and kept between two done statuses. Entering review sets the reviewer
 * when the task has none (and logs `reviewer.changed`).
 */
export async function changeStatus(
  m: TaskMutation,
  task: TaskRow,
  from: StatusRow,
  to: StatusRow,
  { position, reviewer }: ChangeStatusOptions = {},
) {
  m.log(task.id, 'status.changed', { from: statusSnapshot(from), to: statusSnapshot(to) });
  await switchPeriod(m, task.id, to);
  const wasDone = from.category === 'done';
  const isDone = to.category === 'done';
  const patch: { reviewerId?: string } = {};
  if (to.category === 'review' && from.category !== 'review' && !task.reviewerId) {
    const pick = reviewer === undefined ? await projectLead(m.tx, m.project) : reviewer;
    if (pick) {
      patch.reviewerId = pick.id;
      m.log(task.id, 'reviewer.changed', { from: null, to: pick });
    }
  }
  return {
    ...patch,
    statusId: to.id,
    position: position ?? (await endOfStatus(m.tx, to.id)),
    completedAt: isDone ? (wasDone ? (task.completedAt ?? m.now) : m.now) : null,
    updatedAt: m.now,
  };
}

/**
 * Status period switch for a move to another project, where the status changes with the project
 * (`project.changed` is the logged activity; the caller writes the task row).
 */
export async function switchStatusAcrossProjects(m: TaskMutation, task: TaskRow, to: StatusRow) {
  if (to.id !== task.statusId) await switchPeriod(m, task.id, to);
}
