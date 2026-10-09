import { and, isNotNull, isNull, lt } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DbOrTx } from '../db/client.js';
import { notifications } from '../db/schema/index.js';

/** Read notifications move to Archived this long after they were read. */
export const ARCHIVE_AFTER_MS = 30 * 86_400_000;
const DAY_MS = 86_400_000;

/** Archives notifications read more than 30 days before `now`; returns how many. */
export async function archiveReadNotifications(db: DbOrTx, now: Date): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ archivedAt: now })
    .where(
      and(
        isNull(notifications.archivedAt),
        isNotNull(notifications.readAt),
        lt(notifications.readAt, new Date(now.getTime() - ARCHIVE_AFTER_MS)),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length;
}

/**
 * Runs the archive once at startup and then daily, in-process. Off in tests, which call
 * `archiveReadNotifications` directly.
 */
export function scheduleArchiveJob(app: FastifyInstance): void {
  if (app.config.NODE_ENV === 'test') return;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      const archived = await archiveReadNotifications(app.db, app.clock());
      if (archived > 0) app.log.info({ archived }, 'Archived read notifications');
    } catch (err) {
      app.log.error({ err }, 'Notification archive job failed');
    }
  };
  app.addHook('onReady', () => {
    void run();
    timer = setInterval(() => void run(), DAY_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
