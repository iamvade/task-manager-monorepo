import {
  awayUntil,
  groupToday,
  isAway,
  isStandupDay,
  nextStandupDay,
  previousStandupDay,
  zonedInstant,
  type StandupDay,
  type StandupDayMember,
} from '@kite/shared';
import { and, asc, eq, isNull, lt, or } from 'drizzle-orm';
import { upcomingAbsences } from '../absences/query.js';
import type { DbOrTx } from '../db/client.js';
import type { standupGroups } from '../db/schema/index.js';
import { standupBlockers, standupEntries } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { groupDtos } from './groups.js';
import { dayMeetingView } from './meeting.js';
import { hhmm, holidaySet, postByInstant } from './schedule.js';
import { blockerViews, entryViews, type StandupViewer } from './views.js';

type GroupRow = typeof standupGroups.$inferSelect;

/** `today` → the group's date; 400 for a day that hasn't started yet. */
export function resolveDate(group: GroupRow, param: string, now: Date): string {
  const today = groupToday(group, now);
  const date = param === 'today' ? today : param;
  if (date > today) throw httpError(400, 'INVALID_DATE', 'That day hasn’t started yet');
  return date;
}

/** The group page for `date`: who posted, the updates, the blockers and the caller's own update. */
export async function buildStandupDay(
  db: DbOrTx,
  group: GroupRow,
  viewer: StandupViewer,
  date: string,
  now: Date,
): Promise<StandupDay> {
  const [[dto], holidays, entries, blockerRows] = await Promise.all([
    groupDtos(db, [group], viewer, now),
    holidaySet(db, group.workspaceId),
    db
      .select()
      .from(standupEntries)
      .where(and(eq(standupEntries.groupId, group.id), eq(standupEntries.date, date)))
      .orderBy(asc(standupEntries.postedAt), asc(standupEntries.id)),
    // That day's blockers, plus earlier ones nobody has resolved yet.
    db
      .select({
        blocker: standupBlockers,
        entry: { id: standupEntries.id, userId: standupEntries.userId, date: standupEntries.date },
      })
      .from(standupBlockers)
      .innerJoin(standupEntries, eq(standupEntries.id, standupBlockers.entryId))
      .where(
        and(
          eq(standupEntries.groupId, group.id),
          eq(standupEntries.status, 'posted'),
          or(
            eq(standupEntries.date, date),
            and(lt(standupEntries.date, date), isNull(standupBlockers.resolvedAt)),
          ),
        ),
      )
      .orderBy(
        asc(standupEntries.date),
        asc(standupEntries.postedAt),
        asc(standupBlockers.createdAt),
        asc(standupBlockers.id),
      ),
  ]);
  if (!dto) throw httpError(404, 'NOT_FOUND', 'Standup group not found');
  const today = groupToday(group, now);
  const meets = isStandupDay(group, date, holidays);

  // Absences as of `date` (the group DTO's are as of today).
  const absences = await upcomingAbsences(
    db,
    dto.members.map((m) => m.user.id),
    date,
  );
  const posted = entries.filter((e) => e.status === 'posted');
  const postedBy = new Map(posted.map((e) => [e.userId, e]));
  const members = dto.members.map((m): StandupDayMember => {
    const own = { absences: absences.get(m.user.id) ?? [] };
    const entry = postedBy.get(m.user.id);
    const out = isAway(own, date);
    const until = out ? awayUntil(own, date) : null;
    return {
      user: m.user,
      title: m.title,
      // Someone who posted while out of office still counts as posted.
      state: entry ? 'posted' : out ? 'out' : 'not_yet',
      postedAt: entry?.postedAt?.toISOString() ?? null,
      isLate: entry?.isLate ?? false,
      backOn: until ? nextStandupDay(group, until, holidays) : null,
    };
  });

  const [entryDtos, blockers] = await Promise.all([
    entryViews(db, group, posted, viewer),
    blockerViews(db, group, blockerRows, viewer),
  ]);
  const hasOpen = (e: (typeof entryDtos)[number]) => e.blockers.some((b) => !b.resolvedAt);
  const ordered = group.showBlockersFirst
    ? [...entryDtos.filter(hasOpen), ...entryDtos.filter((e) => !hasOpen(e))]
    : entryDtos;
  const mineRow = entries.find((e) => e.userId === viewer.userId);
  const myEntry = mineRow
    ? (entryDtos.find((e) => e.id === mineRow.id) ??
      (await entryViews(db, group, [mineRow], viewer))[0] ??
      null)
    : null;
  const next = nextStandupDay(group, date, holidays);

  return {
    group: dto,
    date,
    today,
    isStandupDay: meets,
    prevDate: previousStandupDay(group, date, holidays),
    nextDate: next && next <= today ? next : null,
    upcomingDate: isStandupDay(group, today, holidays)
      ? today
      : nextStandupDay(group, today, holidays),
    editable: date === today && meets && group.archivedAt === null && dto.isMember,
    postByAt: postByInstant(group, date).toISOString(),
    meetingAt: group.meetingAt
      ? zonedInstant(date, hhmm(group.meetingAt), group.timezone).toISOString()
      : null,
    members,
    postedCount: members.filter((m) => m.state === 'posted').length,
    expectedCount: members.filter((m) => m.state !== 'out').length,
    entries: ordered,
    blockers: [...blockers.filter((b) => !b.resolvedAt), ...blockers.filter((b) => b.resolvedAt)],
    myEntry,
    meeting: await dayMeetingView(db, group, date),
  };
}
