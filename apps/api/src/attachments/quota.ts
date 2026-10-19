import { eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { attachments, feedbackAttachments, projects, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';

export const quotaFull = () =>
  httpError(413, 'STORAGE_QUOTA_EXCEEDED', 'This workspace has no storage left for files');

/**
 * Bytes of files stored by a workspace: task attachments (deleted tasks' files included: still on
 * disk) and feedback files (unclaimed uploads included).
 */
export async function storedBytes(db: DbOrTx, workspaceId: string): Promise<number> {
  const [[taskFiles], [feedbackFiles]] = await Promise.all([
    db
      .select({ bytes: sql<string>`coalesce(sum(${attachments.size}), 0)` })
      .from(attachments)
      .innerJoin(tasks, eq(tasks.id, attachments.taskId))
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(eq(projects.workspaceId, workspaceId)),
    db
      .select({ bytes: sql<string>`coalesce(sum(${feedbackAttachments.size}), 0)` })
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.workspaceId, workspaceId)),
  ]);
  return Number(taskFiles?.bytes ?? 0) + Number(feedbackFiles?.bytes ?? 0);
}
