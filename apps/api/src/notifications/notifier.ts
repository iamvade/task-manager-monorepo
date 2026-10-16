import { and, eq, inArray } from 'drizzle-orm';
import type { NotificationType } from '@kite/shared';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import { projectNotificationLevels, users, workspaceMembers } from '../db/schema/index.js';
import type { DomainEvent } from '../events/bus.js';
import { candidatesFor, pickCandidate } from './fanout.js';
import { activeMember } from '../auth/membership.js';
import { publishNotified, writeNotifications, type Notified } from './deliver.js';

export { COLLAPSE_WINDOW_MS, type Notified } from './deliver.js';

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
      publishNotified(app, event.workspaceId, await notify(app.db, event));
    });
    queue = run.catch(() => undefined);
    // Returned so the bus logs failures and `events.idle()` waits for it.
    return run;
  });
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
        activeMember,
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

  return db.transaction((tx) =>
    writeNotifications(
      tx,
      picks.map((pick) => ({
        userId: pick.userId,
        type: pick.type,
        subject: { taskId: event.taskId },
        actorId: event.actorId,
        activityId: pick.activityId,
        at: event.at,
      })),
    ),
  );
}
