import { findTaskKeys } from '@kite/shared';
import { and, eq, isNull, notInArray, or } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { projects, taskReferences, tasks } from '../db/schema/index.js';

/**
 * Makes `task_references` match the task keys now written in `text`: the source task's title +
 * description (`commentId` null) or one comment. Keys resolve within the workspace only; a
 * task never references itself. Call in the same transaction as the write.
 */
export async function syncReferences(
  tx: DbOrTx,
  source: { taskId: string; workspaceId: string; commentId?: string | null },
  text: string,
): Promise<void> {
  const commentId = source.commentId ?? null;
  const keys = findTaskKeys(text);
  const targets =
    keys.length === 0
      ? []
      : await tx
          .select({ id: tasks.id })
          .from(tasks)
          .innerJoin(projects, eq(projects.id, tasks.projectId))
          .where(
            and(
              eq(projects.workspaceId, source.workspaceId),
              or(...keys.map((k) => and(eq(projects.key, k.key), eq(tasks.number, k.number)))),
            ),
          );
  const ids = targets.map((t) => t.id).filter((id) => id !== source.taskId);
  const ofSource = and(
    eq(taskReferences.sourceTaskId, source.taskId),
    commentId ? eq(taskReferences.commentId, commentId) : isNull(taskReferences.commentId),
  );
  await tx
    .delete(taskReferences)
    .where(ids.length ? and(ofSource, notInArray(taskReferences.targetTaskId, ids)) : ofSource);
  if (ids.length === 0) return;
  await tx
    .insert(taskReferences)
    .values(ids.map((targetTaskId) => ({ sourceTaskId: source.taskId, targetTaskId, commentId })))
    .onConflictDoNothing();
}

/** A deleted comment stops referencing anything. */
export async function dropCommentReferences(tx: DbOrTx, commentId: string): Promise<void> {
  await tx.delete(taskReferences).where(eq(taskReferences.commentId, commentId));
}
