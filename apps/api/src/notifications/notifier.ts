import { and, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { NotificationType } from '@kite/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import {
  notifications,
  projectNotificationLevels,
  users,
  workspaceMembers,
} from '../db/schema/index.js';
import type { DomainEvent } from '../events/bus.js';
import { candidatesFor, pickCandidate } from './fanout.js';

/** An unread notification of the same type on the same task this recent absorbs the new one. */
export const COLLAPSE_WINDOW_MS = 5 * 60_000;

/** What a project set to "direct" still sends: @mentions and new assignments. */
const DIRECT_TYPES: ReadonlySet<NotificationType> = new Set(['mention', 'assigned']);

/**
 * Creates notifications for task events: @mentions, new assignees, and comments and status
 * changes on followed tasks. Events are handled one at a time, so a burst on one task collapses
 * reliably instead of racing.
 */
export function registerNotifier(app: FastifyInstance): void {
  let queue: Promise<void> = Promise.resolve();
  app.events.on('*', (event) => {
    const run = queue.then(async () => {
      // Pushed only after the notifications committed; collapsed ones read as new (bumped).
      for (const n of await notify(app.db, event)) {
        app.realtime.broadcaster.publish({
          to: { userId: n.userId, workspaceId: event.workspaceId },
          message: {
            type: 'notification.created',
            workspaceId: event.workspaceId,
            taskId: event.taskId,
            actorId: event.actorId,
            notificationId: n.id,
            notificationType: n.type,
          },
        });
      }
    });
    queue = run.catch(() => undefined);
    // Returned so the bus logs failures and `events.idle()` waits for it.
    return run;
  });
}

export interface Notified {
  id: string;
  userId: string;
  type: NotificationType;
}

/** Creates (or collapses into) notifications for one event; returns them once committed. */
export async function notify(db: Db, event: DomainEvent): Promise<Notified[]> {
  const candidates = await candidatesFor(db, event);
  candidates.delete(event.actorId);
  if (candidates.size === 0) return [];

  // Current members of the workspace only, with their preferences and level for this project.
  const recipients = await db
    .select({
      id: users.id,
      prefs: users.notificationPrefs,
      level: projectNotificationLevels.level,
    })
    .from(users)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, users.id),
        eq(workspaceMembers.workspaceId, event.workspaceId),
      ),
    )
    .leftJoin(
      projectNotificationLevels,
      and(
        eq(projectNotificationLevels.userId, users.id),
        eq(projectNotificationLevels.projectId, event.projectId),
      ),
    )
    .where(inArray(users.id, [...candidates.keys()]));

  const picks = recipients.flatMap((r) => {
    const level = r.level ?? 'all';
    if (level === 'none') return [];
    const options = (candidates.get(r.id) ?? []).filter(
      (c) => level === 'all' || DIRECT_TYPES.has(c.type),
    );
    const pick = pickCandidate(options, r.prefs);
    return pick ? [{ userId: r.id, ...pick }] : [];
  });
  if (picks.length === 0) return [];

  const since = new Date(event.at.getTime() - COLLAPSE_WINDOW_MS);
  return db.transaction(async (tx) => {
    const notified: Notified[] = [];
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
      let id = existing?.id;
      if (id) {
        await tx.update(notifications).set(latest).where(eq(notifications.id, id));
      } else {
        const [row] = await tx
          .insert(notifications)
          .values({ userId: pick.userId, type: pick.type, taskId: event.taskId, ...latest })
          .returning({ id: notifications.id });
        id = row?.id;
      }
      if (id) notified.push({ id, userId: pick.userId, type: pick.type });
    }
    return notified;
  });
}
