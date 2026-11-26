import {
  canDriveMeeting,
  groupToday,
  isAway,
  isStandupDay,
  type AddStandupMeetingTask,
  type StandupDaySummary,
  type StandupMeetingTask,
  type WorkspaceRole,
} from '@kite/shared';
import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import { upcomingAbsences } from '../absences/query.js';
import type { DbOrTx } from '../db/client.js';
import type { standupGroups } from '../db/schema/index.js';
import {
  standupBlockers,
  standupEntries,
  standupMeetings,
  standupMeetingTasks,
  taskAssignees,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { assertLinkedTasks } from './entry.js';
import { holidaySet } from './schedule.js';
import { standupPeople, standupTaskRefs } from './views.js';

type GroupRow = typeof standupGroups.$inferSelect;
type SummaryRow = typeof standupMeetings.$inferSelect;

/**
 * Whether `userId` may write the day's meeting summary and create tasks from its items (see
 * `canDriveMeeting`): "out" is as of `date`, so a past day follows who facilitated then.
 */
export async function mayDrive(
  db: DbOrTx,
  group: GroupRow,
  userId: string,
  role: WorkspaceRole,
  date: string,
): Promise<boolean> {
  const facilitatorId = group.facilitatorId;
  let facilitatorOut = false;
  if (facilitatorId !== null && facilitatorId !== userId) {
    const absences = await upcomingAbsences(db, [facilitatorId], date);
    facilitatorOut = isAway({ absences: absences.get(facilitatorId) ?? [] }, date);
  }
  return canDriveMeeting(role, facilitatorId, facilitatorOut, userId);
}

export async function findSummary(
  db: DbOrTx,
  groupId: string,
  date: string,
  { lock = false } = {},
): Promise<SummaryRow | null> {
  const query = db
    .select()
    .from(standupMeetings)
    .where(and(eq(standupMeetings.groupId, groupId), eq(standupMeetings.date, date)));
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

async function summaryTasks(
  db: DbOrTx,
  workspaceId: string,
  summaryId: string,
): Promise<StandupMeetingTask[]> {
  const rows = await db
    .select()
    .from(standupMeetingTasks)
    .where(eq(standupMeetingTasks.meetingId, summaryId))
    .orderBy(asc(standupMeetingTasks.createdAt), asc(standupMeetingTasks.taskId));
  if (rows.length === 0) return [];
  const taskIds = rows.map((r) => r.taskId);
  const [refs, assignees] = await Promise.all([
    standupTaskRefs(db, workspaceId, taskIds),
    db
      .select({ taskId: taskAssignees.taskId, userId: taskAssignees.userId })
      .from(taskAssignees)
      .where(inArray(taskAssignees.taskId, taskIds))
      .orderBy(asc(taskAssignees.userId)),
  ]);
  const firstAssignee = new Map<string, string>();
  for (const a of assignees)
    if (!firstAssignee.has(a.taskId)) firstAssignee.set(a.taskId, a.userId);
  const people = await standupPeople(db, workspaceId, [
    ...firstAssignee.values(),
    ...rows.flatMap((r) => (r.sourceUserId ? [r.sourceUserId] : [])),
  ]);
  return rows.flatMap((r): StandupMeetingTask[] => {
    const task = refs.get(r.taskId);
    // Deleted tasks drop out of the list.
    if (!task) return [];
    const assigneeId = firstAssignee.get(r.taskId);
    return [
      {
        task,
        assignee: assigneeId ? (people.get(assigneeId)?.user ?? null) : null,
        source: {
          user: r.sourceUserId ? (people.get(r.sourceUserId)?.user ?? null) : null,
          kind: r.sourceKind,
          entryId: r.sourceEntryId,
          blockerId: r.sourceBlockerId,
          itemIndex: r.sourceItemIndex,
        },
        createdAt: r.createdAt.toISOString(),
      },
    ];
  });
}

/** The summary DTO (notes, who wrote them, the tasks created). */
export async function summaryView(
  db: DbOrTx,
  group: GroupRow,
  row: SummaryRow,
): Promise<StandupDaySummary> {
  const [people, tasks] = await Promise.all([
    standupPeople(db, group.workspaceId, row.facilitatorId ? [row.facilitatorId] : []),
    summaryTasks(db, group.workspaceId, row.id),
  ]);
  return {
    id: row.id,
    notes: row.notes ?? '',
    updatedBy: row.facilitatorId ? (people.get(row.facilitatorId)?.user ?? null) : null,
    updatedAt: row.updatedAt.toISOString(),
    tasks,
  };
}

/** The day page's summary: null until someone writes notes or creates a task. */
export async function daySummaryView(
  db: DbOrTx,
  group: GroupRow,
  date: string,
): Promise<StandupDaySummary | null> {
  const row = await findSummary(db, group.id, date);
  return row ? summaryView(db, group, row) : null;
}

/** Whether `date` has a posted update in the group. */
async function hasPosts(db: DbOrTx, groupId: string, date: string): Promise<boolean> {
  const [row] = await db
    .select({ id: standupEntries.id })
    .from(standupEntries)
    .where(
      and(
        eq(standupEntries.groupId, groupId),
        eq(standupEntries.date, date),
        eq(standupEntries.status, 'posted'),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * Whether a summary can be written for `date` (not a later day, not archived): a standup day, or
 * any day with a posted update (so a schedule change never locks a past day).
 */
export async function isSummaryDay(db: DbOrTx, group: GroupRow, date: string): Promise<boolean> {
  if (isStandupDay(group, date, await holidaySet(db, group.workspaceId))) return true;
  return hasPosts(db, group.id, date);
}

/** 409/400 unless the summary of `date` can change. */
export async function assertSummaryDay(tx: DbOrTx, group: GroupRow, date: string, now: Date) {
  if (group.archivedAt) throw httpError(409, 'GROUP_ARCHIVED', 'This standup group is archived');
  if (date > groupToday(group, now)) {
    throw httpError(400, 'INVALID_DATE', 'That day hasn’t started yet');
  }
  if (!(await isSummaryDay(tx, group, date))) {
    throw httpError(409, 'NOT_STANDUP_DAY', 'The group has no standup on this day');
  }
}

/** The day's row, made on the first write (caller holds the group lock). */
async function ensureSummary(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  now: Date,
): Promise<SummaryRow> {
  const existing = await findSummary(tx, group.id, date, { lock: true });
  if (existing) return existing;
  const [row] = await tx
    .insert(standupMeetings)
    .values({
      groupId: group.id,
      date,
      facilitatorId: userId,
      notes: '',
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw httpError(500, 'INTERNAL', 'Could not save the summary');
  return row;
}

/** The autosaved notes. A no-op save writes nothing (and makes no row). */
export async function updateSummaryNotes(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  notes: string,
  now: Date,
): Promise<{ row: SummaryRow | null; changed: boolean }> {
  const existing = await findSummary(tx, group.id, date, { lock: true });
  if ((existing?.notes ?? '') === notes) return { row: existing, changed: false };
  const row = existing ?? (await ensureSummary(tx, group, date, userId, now));
  const [updated] = await tx
    .update(standupMeetings)
    .set({ notes, facilitatorId: userId, updatedAt: now })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  if (!updated) throw httpError(500, 'INTERNAL', 'Could not save the summary');
  return { row: updated, changed: true };
}

/**
 * Lists a task made with "Create task" under the day's summary, with the item it came from: a
 * Today item of a posted update that day, or a blocker of a posted update in the group from that
 * day or earlier (open blockers carry over). Idempotent. Writes no task activity or references:
 * the task was created through the normal route.
 */
export async function addSummaryTask(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  input: AddStandupMeetingTask,
  now: Date,
): Promise<{ row: SummaryRow; changed: boolean }> {
  await assertLinkedTasks(tx, group.workspaceId, [input.taskId]);
  const [entry] = await tx
    .select()
    .from(standupEntries)
    .where(
      and(
        eq(standupEntries.id, input.sourceEntryId),
        eq(standupEntries.groupId, group.id),
        input.sourceKind === 'blocker'
          ? lte(standupEntries.date, date)
          : eq(standupEntries.date, date),
        eq(standupEntries.status, 'posted'),
      ),
    );
  if (!entry) throw httpError(400, 'INVALID_SOURCE', 'That update isn’t part of this standup');
  if (input.sourceKind === 'blocker') {
    const [blocker] = await tx
      .select({ id: standupBlockers.id })
      .from(standupBlockers)
      .where(
        and(
          eq(standupBlockers.id, input.sourceBlockerId ?? ''),
          eq(standupBlockers.entryId, entry.id),
        ),
      );
    if (!blocker) throw httpError(400, 'INVALID_SOURCE', 'That blocker isn’t in the update');
  } else if ((input.sourceItemIndex ?? -1) >= entry.today.length) {
    throw httpError(400, 'INVALID_SOURCE', 'That item isn’t in the update');
  }
  const row = await ensureSummary(tx, group, date, userId, now);
  const inserted = await tx
    .insert(standupMeetingTasks)
    .values({
      meetingId: row.id,
      taskId: input.taskId,
      sourceUserId: entry.userId,
      sourceKind: input.sourceKind,
      sourceEntryId: entry.id,
      sourceBlockerId: input.sourceBlockerId ?? null,
      sourceItemIndex: input.sourceItemIndex ?? null,
      createdBy: userId,
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning({ taskId: standupMeetingTasks.taskId });
  if (inserted.length === 0) return { row, changed: false };
  const [updated] = await tx
    .update(standupMeetings)
    .set({ updatedAt: now })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  return { row: updated ?? row, changed: true };
}
