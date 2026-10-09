import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import { notifications, users, workspaceMembers } from '../db/schema/index.js';
import type { DomainEvent } from '../events/bus.js';
import { candidatesFor, pickCandidate } from './fanout.js';

/** An unread notification of the same type on the same task this recent absorbs the new one. */
export const COLLAPSE_WINDOW_MS = 5 * 60_000;

/**
 * Creates notifications for task events: @mentions, new assignees, and comments and status
 * changes on followed tasks. Events are handled one at a time, so a burst on one task collapses
 * reliably instead of racing.
 */
export function registerNotifier(app: FastifyInstance): void {
  let queue: Promise<void> = Promise.resolve();
  app.events.on('*', (event) => {
    const run = queue.then(() => notify(app.db, event));
    queue = run.catch(() => undefined);
    // Returned so the bus logs failures and `events.idle()` waits for it.
    return run;
  });
}

export async function notify(db: Db, event: DomainEvent): Promise<void> {
  const candidates = await candidatesFor(db, event);
  candidates.delete(event.actorId);
  if (candidates.size === 0) return;

  // Current members of the workspace only, with their preferences.
  const recipients = await db
    .select({ id: users.id, prefs: users.notificationPrefs })
    .from(users)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, users.id),
        eq(workspaceMembers.workspaceId, event.workspaceId),
      ),
    )
    .where(inArray(users.id, [...candidates.keys()]));

  const picks = recipients.flatMap((r) => {
    const pick = pickCandidate(candidates.get(r.id) ?? [], r.prefs);
    return pick ? [{ userId: r.id, ...pick }] : [];
  });
  if (picks.length === 0) return;

  const since = new Date(event.at.getTime() - COLLAPSE_WINDOW_MS);
  await db.transaction(async (tx) => {
    for (const pick of picks) {
      const [existing] = await tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, pick.userId),
            eq(notifications.taskId, event.taskId),
            eq(notifications.type, pick.type),
            isNull(notifications.readAt),
            isNull(notifications.archivedAt),
            gt(notifications.createdAt, since),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(1)
        .for('update');
      const latest = { actorId: event.actorId, activityId: pick.activityId, createdAt: event.at };
      if (existing) {
        await tx.update(notifications).set(latest).where(eq(notifications.id, existing.id));
      } else {
        await tx.insert(notifications).values({
          userId: pick.userId,
          type: pick.type,
          taskId: event.taskId,
          ...latest,
        });
      }
    }
  });
}
