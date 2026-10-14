import { findTaskKeys } from '@kite/shared';
import { and, eq, isNull, notInArray, or, sql } from 'drizzle-orm';
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

/** Same pattern as `findTaskKeys`, in Postgres ARE syntax. */
const KEY_PATTERN = '(?<![A-Za-z0-9-])([A-Z][A-Z0-9]{1,9})-([0-9]{1,9})(?![A-Za-z0-9])';

/**
 * Builds `task_references` from what is already written (migration 0013 does the same for
 * existing data; the seed and scenario call it after bulk inserts that bypass the routes).
 */
export async function backfillReferences(db: DbOrTx): Promise<void> {
  await db.execute(sql`
    insert into task_references (id, source_task_id, target_task_id, comment_id, created_at)
    select kite_uuidv7(), src.id, tgt.id, null, now()
    from tasks src
    join projects sp on sp.id = src.project_id
    cross join lateral regexp_matches(src.title || ' ' || src.description_text, ${KEY_PATTERN}, 'g') as m(parts)
    join projects tp on tp.workspace_id = sp.workspace_id and tp.key = m.parts[1]
    join tasks tgt on tgt.project_id = tp.id and tgt.number = m.parts[2]::int
    where tgt.id <> src.id
    on conflict do nothing`);
  await db.execute(sql`
    insert into task_references (id, source_task_id, target_task_id, comment_id, created_at)
    select kite_uuidv7(), src.id, tgt.id, c.id, c.created_at
    from comments c
    join tasks src on src.id = c.task_id
    join projects sp on sp.id = src.project_id
    cross join lateral regexp_matches(c.body_text, ${KEY_PATTERN}, 'g') as m(parts)
    join projects tp on tp.workspace_id = sp.workspace_id and tp.key = m.parts[1]
    join tasks tgt on tgt.project_id = tp.id and tgt.number = m.parts[2]::int
    where tgt.id <> src.id and c.deleted_at is null
    on conflict do nothing`);
}
