import type { Attachment } from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { attachments, users } from '../db/schema/index.js';
import { userRefColumns } from './user-ref.js';

const select = (db: DbOrTx) =>
  db
    .select({ attachment: attachments, uploader: userRefColumns })
    .from(attachments)
    .innerJoin(users, eq(users.id, attachments.uploaderId));

const toDto = ({
  attachment,
  uploader,
}: {
  attachment: typeof attachments.$inferSelect;
  uploader: Attachment['uploader'];
}): Attachment => ({
  id: attachment.id,
  filename: attachment.filename,
  mime: attachment.mime,
  size: attachment.size,
  uploader,
  createdAt: attachment.createdAt.toISOString(),
});

/** Attachments of a task, oldest first. */
export async function listAttachments(db: DbOrTx, taskId: string): Promise<Attachment[]> {
  const rows = await select(db)
    .where(eq(attachments.taskId, taskId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  return rows.map(toDto);
}

export async function getAttachment(db: DbOrTx, id: string): Promise<Attachment | undefined> {
  const [row] = await select(db).where(eq(attachments.id, id));
  return row && toDto(row);
}
