import { and, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import { feedbackAttachments } from '../db/schema/index.js';
import type { Storage } from '../storage/storage.js';

/** Uploads the public form never sent are removed after this long. */
export const UNCLAIMED_UPLOAD_TTL_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Deletes uploads unclaimed for a day, rows then files; returns how many. */
export async function removeUnclaimedUploads(
  db: DbOrTx,
  storage: Storage,
  now: Date,
  log?: FastifyInstance['log'],
): Promise<number> {
  const rows = await db
    .delete(feedbackAttachments)
    .where(
      and(
        isNull(feedbackAttachments.feedbackId),
        lt(feedbackAttachments.createdAt, new Date(now.getTime() - UNCLAIMED_UPLOAD_TTL_MS)),
      ),
    )
    .returning({ key: feedbackAttachments.storageKey });
  for (const { key } of rows) {
    await storage.delete(key).catch((err: unknown) => {
      log?.error({ err, key }, 'Could not delete an unclaimed feedback upload');
    });
  }
  return rows.length;
}

/** Hourly, in-process. Off in tests, which call `removeUnclaimedUploads` directly. */
export function scheduleFeedbackCleanup(app: FastifyInstance): void {
  if (app.config.NODE_ENV === 'test') return;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      const removed = await removeUnclaimedUploads(app.db, app.storage, app.clock(), app.log);
      if (removed > 0) app.log.info({ removed }, 'Removed unclaimed feedback uploads');
    } catch (err) {
      app.log.error({ err }, 'Feedback upload cleanup failed');
    }
  };
  app.addHook('onReady', () => {
    void run();
    timer = setInterval(() => void run(), HOUR_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
