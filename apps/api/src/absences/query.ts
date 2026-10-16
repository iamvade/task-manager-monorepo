import { addDays, type AbsenceRef } from '@kite/shared';
import { and, asc, gte, inArray, sql } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';
import { userAbsences } from '../db/schema/index.js';

/**
 * Current and upcoming absences per user, by start date. "Current" is judged on the viewer's day
 * (the client's `isAway`), so this keeps anything that ended yesterday or later in UTC terms: no
 * zone is more than a day behind.
 */
export async function upcomingAbsences(
  db: DbOrTx,
  userIds: readonly string[],
  /** The viewer's today (`YYYY-MM-DD`); defaults to the database's date. */
  today?: string,
): Promise<Map<string, AbsenceRef[]>> {
  const byUser = new Map<string, AbsenceRef[]>();
  if (userIds.length === 0) return byUser;
  const rows = await db
    .select({
      id: userAbsences.id,
      userId: userAbsences.userId,
      startDate: userAbsences.startDate,
      endDate: userAbsences.endDate,
      note: userAbsences.note,
    })
    .from(userAbsences)
    .where(
      and(
        inArray(userAbsences.userId, [...new Set(userIds)]),
        gte(userAbsences.endDate, today ? addDays(today, -1) : sql`(current_date - 1)`),
      ),
    )
    .orderBy(asc(userAbsences.startDate));
  for (const { userId, ...absence } of rows) {
    const list = byUser.get(userId) ?? [];
    list.push(absence);
    byUser.set(userId, list);
  }
  return byUser;
}
