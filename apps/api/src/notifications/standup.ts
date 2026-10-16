import type { NotificationType } from '@kite/shared';
import { inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { users, type standupGroups } from '../db/schema/index.js';
import { activeGroupMemberIds } from '../standups/schedule.js';
import { publishNotified, writeNotifications } from './deliver.js';
import { pickCandidate } from './fanout.js';

type GroupRow = typeof standupGroups.$inferSelect;

export interface StandupNotice {
  group: GroupRow;
  /** The standup day. */
  date: string;
  entryId: string;
  blockerId?: string | null;
  replyId?: string | null;
  actorId: string;
  /** Every reason each person has to hear about it; they get the best one they enabled. */
  candidates: Map<string, NotificationType[]>;
}

/**
 * Notifications about something that happened in a standup group: a helper named on a blocker,
 * a blocker resolved, a reply, an @mention in a reply. Only the group's active members get them
 * (standup content is theirs), never the actor. Call after the change committed; failures are
 * logged, never thrown (the change itself already happened).
 */
export async function notifyStandup(app: FastifyInstance, notice: StandupNotice): Promise<void> {
  try {
    const { group } = notice;
    notice.candidates.delete(notice.actorId);
    const members = new Set(await activeGroupMemberIds(app.db, group));
    const ids = [...notice.candidates.keys()].filter((id) => members.has(id));
    if (ids.length === 0) return;
    const recipients = await app.db
      .select({ id: users.id, prefs: users.notificationPrefs })
      .from(users)
      .where(inArray(users.id, ids));
    const at = app.clock();
    const deliveries = recipients.flatMap((r) => {
      const types = notice.candidates.get(r.id) ?? [];
      const pick = pickCandidate(
        types.map((type) => ({ type, activityId: null })),
        r.prefs,
      );
      return pick
        ? [
            {
              userId: r.id,
              type: pick.type,
              subject: {
                standupGroupId: group.id,
                standupDate: notice.date,
                standupEntryId: notice.entryId,
                standupBlockerId: notice.blockerId ?? null,
                standupReplyId: notice.replyId ?? null,
              },
              actorId: notice.actorId,
              activityId: null,
              at,
            },
          ]
        : [];
    });
    if (deliveries.length === 0) return;
    const notified = await app.db.transaction((tx) => writeNotifications(tx, deliveries));
    publishNotified(app, group.workspaceId, notified);
  } catch (error) {
    app.log.error({ err: error, groupId: notice.group.id }, 'standup notification failed');
  }
}
