import { addDays, zonedInstant } from '@kite/shared';
import { and, asc, eq } from 'drizzle-orm';
import { activeMember } from '../auth/membership.js';
import type { DbOrTx } from '../db/client.js';
import type { standupGroups } from '../db/schema/index.js';
import { standupGroupMembers, workspaceHolidays, workspaceMembers } from '../db/schema/index.js';

type GroupRow = typeof standupGroups.$inferSelect;

/** `HH:mm:ss` from Postgres `time` → `HH:mm`. */
export const hhmm = (t: string) => t.slice(0, 5);

/** The workspace's public holidays (skipped as standup days). */
export async function holidaySet(db: DbOrTx, workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ date: workspaceHolidays.date })
    .from(workspaceHolidays)
    .where(eq(workspaceHolidays.workspaceId, workspaceId));
  return new Set(rows.map((r) => r.date));
}

/** The post-by time of the group's standup day `date`, as an instant. */
export const postByInstant = (group: GroupRow, date: string) =>
  zonedInstant(date, hhmm(group.postBy), group.timezone);

/** Midnight at the start of `date` in the group's zone. */
export const dayStart = (group: GroupRow, date: string) =>
  zonedInstant(date, '00:00', group.timezone);

/** Midnight at the end of `date` in the group's zone (the edit window closes then). */
export const dayEnd = (group: GroupRow, date: string) => dayStart(group, addDays(date, 1));

/** Ids of the group's members who are active in the workspace, by position. */
export async function activeGroupMemberIds(db: DbOrTx, group: GroupRow): Promise<string[]> {
  const rows = await db
    .select({ userId: standupGroupMembers.userId })
    .from(standupGroupMembers)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.userId, standupGroupMembers.userId),
        eq(workspaceMembers.workspaceId, group.workspaceId),
        activeMember,
      ),
    )
    .where(eq(standupGroupMembers.groupId, group.id))
    .orderBy(asc(standupGroupMembers.position));
  return rows.map((r) => r.userId);
}
