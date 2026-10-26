import { CLOSED_CATEGORIES, isClosedCategory, type StatusCategory } from '@kite/shared';
import { and, eq, isNull, notInArray } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { statuses, taskStatusPeriods, users, workspaceMembers } from '../db/schema/index.js';
import type { TaskMutation, TaskRow } from './mutation.js';
import { endOfStatus, statusSnapshot } from './refs.js';
import { activeMember } from '../auth/membership.js';

// The only code that changes `tasks.status_id`. Each status change closes the task's open
// status period and opens one for the new status in the same transaction; a deferred trigger
// (drizzle/0006_report_backfill.sql) rejects any commit where a task's status has no matching
// open period.

type StatusRow = typeof statuses.$inferSelect;

/** Where-condition: the joined `statuses` row is open (not done or cancelled). */
export const openStatusSql = () => notInArray(statuses.category, [...CLOSED_CATEGORIES]);

/**
 * `completed_at` (done) and `closed_at` (done or cancelled) for a task entering a `to` status:
 * set on entering, kept while moving between statuses of the same kind, cleared on leaving.
 * `prev` is null for a new task.
 */
export function closureStamps(
  prev: { category: StatusCategory; completedAt: Date | null; closedAt: Date | null } | null,
  to: StatusCategory,
  now: Date,
) {
  const stamp = (was: boolean, is: boolean, at: Date | null | undefined) =>
    is ? (was ? (at ?? now) : now) : null;
  return {
    completedAt: stamp(prev?.category === 'done', to === 'done', prev?.completedAt),
    closedAt: stamp(
      prev !== null && isClosedCategory(prev.category),
      isClosedCategory(to),
      prev?.closedAt,
    ),
  };
}

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
        activeMember,
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
    ...closureStamps({ ...task, category: from.category }, to.category, m.now),
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
