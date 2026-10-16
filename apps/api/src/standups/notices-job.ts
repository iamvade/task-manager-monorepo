import {
  groupToday,
  isAway,
  isStandupDay,
  zonedInstant,
  type NotificationType,
  type StandupDigestData,
} from '@kite/shared';
import { and, count, eq, inArray, isNull, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { upcomingAbsences } from '../absences/query.js';
import {
  standupBlockers,
  standupEntries,
  standupGroups,
  standupNotices,
  users,
} from '../db/schema/index.js';
import { publishNotified, writeNotifications, type Delivery } from '../notifications/deliver.js';
import { activeGroupMemberIds, dayEnd, hhmm, holidaySet, postByInstant } from './schedule.js';
import { standupPeople } from './views.js';

type GroupRow = typeof standupGroups.$inferSelect;

/** How often the scheduler looks for reminders and digests that are due. */
export const NOTICE_TICK_MS = 60_000;

export interface NoticeRun {
  reminders: number;
  digests: number;
}

/**
 * Sends what's due at `now`, for every group on one of its standup days (holidays skipped):
 * - the **reminder**, from the group's reminder time until its post-by time, to members who
 *   haven't posted and aren't out of office;
 * - the **digest**, from the post-by time until the day ends, to the facilitator (unless they're
 *   out): who posted, who didn't, who is out, how many blockers are open.
 * Each is recorded in `standup_notices` before it's sent, in the same transaction, so nobody gets
 * one twice for a day, across restarts too. A missed window is never caught up on later.
 */
export async function runStandupNotices(app: FastifyInstance, now: Date): Promise<NoticeRun> {
  const run: NoticeRun = { reminders: 0, digests: 0 };
  const groups = await app.db.select().from(standupGroups).where(isNull(standupGroups.archivedAt));
  const holidays = new Map<string, Set<string>>();
  for (const group of groups) {
    let days = holidays.get(group.workspaceId);
    if (!days) {
      days = await holidaySet(app.db, group.workspaceId);
      holidays.set(group.workspaceId, days);
    }
    const today = groupToday(group, now);
    if (!isStandupDay(group, today, days)) continue;
    const postBy = postByInstant(group, today);
    const remind =
      group.reminderAt !== null &&
      now >= zonedInstant(today, hhmm(group.reminderAt), group.timezone) &&
      now < postBy;
    const digest = group.facilitatorId !== null && now >= postBy && now < dayEnd(group, today);
    if (!remind && !digest) continue;

    const memberIds = await activeGroupMemberIds(app.db, group);
    const [absences, posted] = await Promise.all([
      upcomingAbsences(app.db, memberIds, today),
      app.db
        .select({ userId: standupEntries.userId })
        .from(standupEntries)
        .where(
          and(
            eq(standupEntries.groupId, group.id),
            eq(standupEntries.date, today),
            eq(standupEntries.status, 'posted'),
          ),
        ),
    ]);
    const postedIds = new Set(posted.map((p) => p.userId));
    const out = new Set(
      memberIds.filter((id) => isAway({ absences: absences.get(id) ?? [] }, today)),
    );

    if (remind) {
      const due = memberIds.filter((id) => !postedIds.has(id) && !out.has(id));
      run.reminders += await send(app, group, today, 'reminder', due, 'standup_reminder', now);
    }
    if (digest && group.facilitatorId) {
      const facilitator = group.facilitatorId;
      if (memberIds.includes(facilitator) && !out.has(facilitator)) {
        const data = await digestData(app, group, today, memberIds, postedIds, out);
        run.digests += await send(
          app,
          group,
          today,
          'digest',
          [facilitator],
          'standup_digest',
          now,
          data,
        );
      }
    }
  }
  return run;
}

/** Records and sends one notice per recipient; returns how many notifications were created. */
async function send(
  app: FastifyInstance,
  group: GroupRow,
  date: string,
  kind: 'reminder' | 'digest',
  userIds: readonly string[],
  type: NotificationType,
  now: Date,
  data: StandupDigestData | null = null,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const prefs = new Map(
    (
      await app.db
        .select({ id: users.id, prefs: users.notificationPrefs })
        .from(users)
        .where(inArray(users.id, [...userIds]))
    ).map((u) => [u.id, u.prefs]),
  );
  const notified = await app.db.transaction(async (tx) => {
    const claimed = await tx
      .insert(standupNotices)
      .values(userIds.map((userId) => ({ groupId: group.id, userId, date, kind, sentAt: now })))
      .onConflictDoNothing()
      .returning({ userId: standupNotices.userId });
    // Someone who turned standup notifications off is still recorded, so turning them back on
    // later that day doesn't send a stale reminder.
    const deliveries = claimed
      .filter((c) => prefs.get(c.userId)?.standups !== false)
      .map((c): Delivery => ({
        userId: c.userId,
        type,
        subject: { standupGroupId: group.id, standupDate: date },
        actorId: null,
        activityId: null,
        data,
        at: now,
      }));
    return writeNotifications(tx, deliveries);
  });
  publishNotified(app, group.workspaceId, notified);
  return notified.length;
}

async function digestData(
  app: FastifyInstance,
  group: GroupRow,
  date: string,
  memberIds: readonly string[],
  postedIds: ReadonlySet<string>,
  out: ReadonlySet<string>,
): Promise<StandupDigestData> {
  const [people, [open]] = await Promise.all([
    standupPeople(app.db, group.workspaceId, memberIds),
    app.db
      .select({ n: count() })
      .from(standupBlockers)
      .innerJoin(standupEntries, eq(standupEntries.id, standupBlockers.entryId))
      .where(
        and(
          eq(standupEntries.groupId, group.id),
          eq(standupEntries.status, 'posted'),
          lte(standupEntries.date, date),
          isNull(standupBlockers.resolvedAt),
        ),
      ),
  ]);
  const refs = (ids: readonly string[]) => ids.flatMap((id) => people.get(id)?.user ?? []);
  return {
    posted: refs(memberIds.filter((id) => postedIds.has(id))),
    notPosted: refs(memberIds.filter((id) => !postedIds.has(id) && !out.has(id))),
    out: refs(memberIds.filter((id) => !postedIds.has(id) && out.has(id))),
    openBlockers: open?.n ?? 0,
  };
}

/**
 * Checks every minute, in-process (one API instance). Off in tests, which call
 * `runStandupNotices` directly. Ticks never overlap.
 */
export function scheduleStandupNotices(app: FastifyInstance): void {
  if (app.config.NODE_ENV === 'test') return;
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const sent = await runStandupNotices(app, app.clock());
      if (sent.reminders + sent.digests > 0) app.log.info(sent, 'Sent standup notices');
    } catch (err) {
      app.log.error({ err }, 'Standup notice job failed');
    } finally {
      running = false;
    }
  };
  app.addHook('onReady', () => {
    void tick();
    timer = setInterval(() => void tick(), NOTICE_TICK_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
