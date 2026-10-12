import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { sprintMemberships, sprints } from '../db/schema/index.js';
import type { TaskMutation, TaskRow } from './mutation.js';
import { sprintSnapshot } from './refs.js';

// The only code that changes `tasks.sprint_id`. Each change closes the task's open sprint
// membership and opens one for the new sprint in the same transaction (a deferred trigger checks
// it at commit). Committed scope = memberships open at sprint start.

type SprintRow = typeof sprints.$inferSelect;

export interface MembershipStart {
  taskId: string;
  sprintId: string;
  at: Date;
  actorId: string;
}

/** Opens memberships of new tasks created into a sprint. */
export async function openSprintMemberships(db: DbOrTx, rows: readonly MembershipStart[]) {
  if (rows.length === 0) return;
  await db.insert(sprintMemberships).values(
    rows.map((r) => ({
      taskId: r.taskId,
      sprintId: r.sprintId,
      addedAt: r.at,
      addedBy: r.actorId,
    })),
  );
}

/** Logs `sprint.changed` and opens the membership of a task created into `sprint`. */
export async function startInSprint(m: TaskMutation, taskId: string, sprint: SprintRow) {
  m.log(taskId, 'sprint.changed', { from: null, to: sprintSnapshot(sprint) });
  await openSprintMemberships(m.tx, [
    { taskId, sprintId: sprint.id, at: m.now, actorId: m.actorId },
  ]);
}

/**
 * Moves `task` into `to` (null = out of any sprint): logs `sprint.changed`, closes the open
 * membership and opens the new one. Returns the task columns to write (nothing when unchanged).
 */
export async function setSprint(m: TaskMutation, task: TaskRow, to: SprintRow | null) {
  if ((to?.id ?? null) === task.sprintId) return {};
  const [from] = task.sprintId
    ? await m.tx.select().from(sprints).where(eq(sprints.id, task.sprintId))
    : [];
  m.log(task.id, 'sprint.changed', {
    from: from ? sprintSnapshot(from) : null,
    to: to ? sprintSnapshot(to) : null,
  });
  await m.tx
    .update(sprintMemberships)
    .set({ removedAt: m.now, removedBy: m.actorId })
    .where(and(eq(sprintMemberships.taskId, task.id), isNull(sprintMemberships.removedAt)));
  if (to) {
    await openSprintMemberships(m.tx, [
      { taskId: task.id, sprintId: to.id, at: m.now, actorId: m.actorId },
    ]);
  }
  return { sprintId: to?.id ?? null };
}
