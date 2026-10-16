import {
  canManageStandupGroup,
  groupToday,
  isStandupDay,
  type StandupGroup,
  type WorkspaceRole,
} from '@kite/shared';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import { upcomingAbsences } from '../absences/query.js';
import { activeMember } from '../auth/membership.js';
import type { DbOrTx } from '../db/client.js';
import { positionAfter } from '../db/position.js';
import {
  standupEntries,
  standupGroupMembers,
  standupGroups,
  users,
  workspaceHolidays,
  workspaceMembers,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';

type GroupRow = typeof standupGroups.$inferSelect;

/** `HH:mm:ss` from Postgres `time` → `HH:mm`. */
const hhmm = (t: string) => t.slice(0, 5);
const hhmmOrNull = (t: string | null) => (t === null ? null : hhmm(t));

export interface Viewer {
  userId: string;
  role: WorkspaceRole;
}

/** Group DTOs for `groups` (all in one workspace), as `viewer` sees them at `now`. */
export async function groupDtos(
  db: DbOrTx,
  groups: readonly GroupRow[],
  viewer: Viewer,
  now: Date,
): Promise<StandupGroup[]> {
  const first = groups[0];
  if (!first) return [];
  const ids = groups.map((g) => g.id);
  const [members, holidays, posted] = await Promise.all([
    db
      .select({
        groupId: standupGroupMembers.groupId,
        position: standupGroupMembers.position,
        id: users.id,
        name: users.name,
        initials: users.initials,
        avatarColor: users.avatarColor,
        title: workspaceMembers.title,
      })
      .from(standupGroupMembers)
      .innerJoin(users, eq(users.id, standupGroupMembers.userId))
      .innerJoin(
        workspaceMembers,
        and(
          eq(workspaceMembers.userId, standupGroupMembers.userId),
          eq(workspaceMembers.workspaceId, first.workspaceId),
          activeMember,
        ),
      )
      .where(inArray(standupGroupMembers.groupId, ids))
      .orderBy(asc(standupGroupMembers.position)),
    db
      .select({ date: workspaceHolidays.date })
      .from(workspaceHolidays)
      .where(eq(workspaceHolidays.workspaceId, first.workspaceId)),
    // Posted entries: who posted on which date, plus whether a group has any at all.
    db
      .select({
        groupId: standupEntries.groupId,
        userId: standupEntries.userId,
        date: standupEntries.date,
      })
      .from(standupEntries)
      .where(and(inArray(standupEntries.groupId, ids), eq(standupEntries.status, 'posted')))
      .orderBy(desc(standupEntries.date)),
  ]);
  const holidaySet = new Set(holidays.map((h) => h.date));
  // The earliest group "today", so nobody's current absence is cut off.
  const earliestToday = groups.map((g) => groupToday(g, now)).sort()[0];
  const absences = await upcomingAbsences(
    db,
    members.map((m) => m.id),
    earliestToday,
  );

  return groups.map((g) => {
    const today = groupToday(g, now);
    const own = members.filter((m) => m.groupId === g.id);
    const groupPosts = posted.filter((p) => p.groupId === g.id);
    return {
      id: g.id,
      workspaceId: g.workspaceId,
      name: g.name,
      timezone: g.timezone,
      days: g.days,
      postBy: hhmm(g.postBy),
      reminderAt: hhmmOrNull(g.reminderAt),
      meetingAt: hhmmOrNull(g.meetingAt),
      facilitatorId: g.facilitatorId,
      speakingOrder: g.speakingOrder,
      secondsPerPerson: g.secondsPerPerson,
      totalMeetingMinutes: g.totalMeetingMinutes,
      showBlockersFirst: g.showBlockersFirst,
      markLinkedTasksBlocked: g.markLinkedTasksBlocked,
      createdAt: g.createdAt.toISOString(),
      archivedAt: g.archivedAt?.toISOString() ?? null,
      members: own.map((m) => ({
        user: { id: m.id, name: m.name, initials: m.initials, avatarColor: m.avatarColor },
        title: m.title,
        position: m.position,
        absences: absences.get(m.id) ?? [],
      })),
      isMember: own.some((m) => m.id === viewer.userId),
      canEdit: canManageStandupGroup(viewer.role, g.facilitatorId, viewer.userId),
      today,
      meetsToday: isStandupDay(g, today, holidaySet),
      myPosted: groupPosts.some((p) => p.userId === viewer.userId && p.date === today),
      hasPosts: groupPosts.length > 0,
    };
  });
}

/** 400 unless every id is an active member of the workspace. */
export async function requireActiveMembers(
  db: DbOrTx,
  workspaceId: string,
  userIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  const found = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        inArray(workspaceMembers.userId, unique),
        activeMember,
      ),
    );
  if (found.length !== unique.length) {
    throw httpError(400, 'INVALID_MEMBER', 'Only active workspace members can join a group');
  }
}

/** Locks the group row so member positions are allocated one writer at a time. */
export async function lockGroup(tx: DbOrTx, groupId: string): Promise<void> {
  await tx.execute(sql`select 1 from standup_groups where id = ${groupId} for update`);
}

/** Replaces the member list with `userIds` in that order (duplicates dropped). */
export async function setGroupMembers(
  tx: DbOrTx,
  groupId: string,
  userIds: readonly string[],
): Promise<void> {
  const ordered = [...new Set(userIds)];
  // People who stay keep their join time (earlier days list only who was in the group then).
  const joined = new Map(
    (
      await tx
        .select({ userId: standupGroupMembers.userId, addedAt: standupGroupMembers.addedAt })
        .from(standupGroupMembers)
        .where(eq(standupGroupMembers.groupId, groupId))
    ).map((r) => [r.userId, r.addedAt]),
  );
  await tx.delete(standupGroupMembers).where(eq(standupGroupMembers.groupId, groupId));
  if (ordered.length === 0) return;
  const keys = generateNKeysBetween(null, null, ordered.length);
  await tx.insert(standupGroupMembers).values(
    ordered.map((userId, i) => ({
      groupId,
      userId,
      position: keys[i] ?? positionAfter(null),
      ...(joined.has(userId) ? { addedAt: joined.get(userId) } : {}),
    })),
  );
}

/** Appends `userId` to the group unless they're already in it. */
export async function appendGroupMember(tx: DbOrTx, groupId: string, userId: string) {
  const rows = await tx
    .select({ userId: standupGroupMembers.userId, position: standupGroupMembers.position })
    .from(standupGroupMembers)
    .where(eq(standupGroupMembers.groupId, groupId))
    .orderBy(asc(standupGroupMembers.position));
  if (rows.some((r) => r.userId === userId)) return;
  await tx
    .insert(standupGroupMembers)
    .values({ groupId, userId, position: positionAfter(rows.at(-1)?.position) });
}

/**
 * Offboarding: the leaver's facilitator roles go to `successor` (who joins those groups if they
 * aren't in them), or are cleared without one.
 */
export async function handOverFacilitator(
  tx: DbOrTx,
  workspaceId: string,
  leaverId: string,
  successor: string | null,
): Promise<void> {
  const led = await tx
    .update(standupGroups)
    .set({ facilitatorId: successor })
    .where(
      and(
        eq(standupGroups.workspaceId, workspaceId),
        eq(standupGroups.facilitatorId, leaverId),
        isNull(standupGroups.archivedAt),
      ),
    )
    .returning({ id: standupGroups.id });
  if (!successor) return;
  for (const { id } of led) {
    await lockGroup(tx, id);
    await appendGroupMember(tx, id, successor);
  }
}
