import {
  canDriveMeeting,
  groupToday,
  isAway,
  isStandupDay,
  type AddStandupMeetingTask,
  type SpeakingOrder,
  type StandupDayMeeting,
  type StandupMeeting,
  type StandupMeetingSpeaker,
  type StandupMeetingTask,
  type WorkspaceRole,
} from '@kite/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { upcomingAbsences } from '../absences/query.js';
import type { DbOrTx } from '../db/client.js';
import type { standupGroups } from '../db/schema/index.js';
import {
  standupBlockers,
  standupEntries,
  standupMeetings,
  standupMeetingTasks,
  taskAssignees,
  users,
} from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { assertLinkedTasks } from './entry.js';
import { activeGroupMemberIds, holidaySet } from './schedule.js';
import { standupPeople, standupTaskRefs } from './views.js';

type GroupRow = typeof standupGroups.$inferSelect;
type MeetingRow = typeof standupMeetings.$inferSelect;

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Seconds between two instants, whole. */
const secondsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));

/** Who is out of office on `date`, among `userIds`. */
async function outOn(db: DbOrTx, userIds: readonly string[], date: string): Promise<Set<string>> {
  const absences = await upcomingAbsences(db, userIds, date);
  return new Set(userIds.filter((id) => isAway({ absences: absences.get(id) ?? [] }, date)));
}

/** Whether `userId` may start and drive the group's meeting on `date` (see `canDriveMeeting`). */
export async function mayDrive(
  db: DbOrTx,
  group: GroupRow,
  userId: string,
  role: WorkspaceRole,
  date: string,
): Promise<boolean> {
  const facilitatorOut =
    group.facilitatorId !== null && (await outOn(db, [group.facilitatorId], date)).size > 0;
  return canDriveMeeting(role, group.facilitatorId, facilitatorOut, userId);
}

export async function findMeeting(
  db: DbOrTx,
  groupId: string,
  date: string,
  { lock = false } = {},
): Promise<MeetingRow | null> {
  const query = db
    .select()
    .from(standupMeetings)
    .where(and(eq(standupMeetings.groupId, groupId), eq(standupMeetings.date, date)));
  const [row] = lock ? await query.for('update') : await query;
  return row ?? null;
}

interface DayFacts {
  /** Posted updates of the day by author. */
  posted: Map<string, { entryId: string; postedAt: Date | null }>;
  out: Set<string>;
}

async function dayFacts(
  db: DbOrTx,
  group: GroupRow,
  date: string,
  userIds: readonly string[],
): Promise<DayFacts> {
  const [entries, out] = await Promise.all([
    db
      .select({
        id: standupEntries.id,
        userId: standupEntries.userId,
        postedAt: standupEntries.postedAt,
      })
      .from(standupEntries)
      .where(
        and(
          eq(standupEntries.groupId, group.id),
          eq(standupEntries.date, date),
          eq(standupEntries.status, 'posted'),
        ),
      ),
    outOn(db, userIds, date),
  ]);
  return {
    posted: new Map(entries.map((e) => [e.userId, { entryId: e.id, postedAt: e.postedAt }])),
    out,
  };
}

/** Someone who posted while out of office still speaks; otherwise out = skipped. */
const isSkipped = (facts: DayFacts, userId: string) =>
  facts.out.has(userId) && !facts.posted.has(userId);

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * The speaking order fixed at start, by the group's setting: posting order (posted by post
 * time, then the rest by group position), alphabetical, or random. Out of office last.
 */
async function speakingOrder(
  db: DbOrTx,
  setting: SpeakingOrder,
  memberIds: string[],
  facts: DayFacts,
): Promise<string[]> {
  const speaking = memberIds.filter((id) => !isSkipped(facts, id));
  const skipped = memberIds.filter((id) => isSkipped(facts, id));
  let ordered: string[];
  if (setting === 'posting_order') {
    const postedAt = (id: string) => facts.posted.get(id)?.postedAt?.getTime() ?? null;
    const posted = speaking
      .filter((id) => postedAt(id) !== null)
      .sort((a, b) => (postedAt(a) ?? 0) - (postedAt(b) ?? 0));
    ordered = [...posted, ...speaking.filter((id) => postedAt(id) === null)];
  } else if (setting === 'alphabetical') {
    const rows =
      speaking.length === 0
        ? []
        : await db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, speaking));
    const name = new Map(rows.map((r) => [r.id, r.name]));
    ordered = [...speaking].sort((a, b) => (name.get(a) ?? '').localeCompare(name.get(b) ?? ''));
  } else {
    ordered = shuffle(speaking);
  }
  return [...ordered, ...skipped];
}

async function meetingTasks(
  db: DbOrTx,
  workspaceId: string,
  meetingId: string,
): Promise<StandupMeetingTask[]> {
  const rows = await db
    .select()
    .from(standupMeetingTasks)
    .where(eq(standupMeetingTasks.meetingId, meetingId))
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

/** The meeting DTO: speakers with their state that day, the live timing, notes and tasks. */
export async function meetingView(
  db: DbOrTx,
  group: GroupRow,
  row: MeetingRow,
): Promise<StandupMeeting> {
  const order = row.speakingOrder;
  const [facts, people, tasks] = await Promise.all([
    dayFacts(db, group, row.date, order),
    standupPeople(db, group.workspaceId, [
      ...order,
      ...(row.facilitatorId ? [row.facilitatorId] : []),
    ]),
    meetingTasks(db, group.workspaceId, row.id),
  ]);
  const speakers = order.flatMap((id): StandupMeetingSpeaker[] => {
    const person = people.get(id);
    if (!person) return [];
    const posted = facts.posted.get(id);
    return [
      {
        user: person.user,
        title: person.title,
        state: posted ? 'posted' : facts.out.has(id) ? 'out' : 'not_yet',
        postedAt: iso(posted?.postedAt ?? null),
        entryId: posted?.entryId ?? null,
      },
    ];
  });
  return {
    id: row.id,
    groupId: row.groupId,
    date: row.date,
    facilitator: row.facilitatorId ? (people.get(row.facilitatorId)?.user ?? null) : null,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    order: speakers,
    currentUserId: row.currentUserId,
    currentStartedAt: iso(row.currentStartedAt),
    durations: row.durations,
    totalSeconds: row.totalSeconds,
    notes: row.notes ?? '',
    notesSavedAt: iso(row.notesSavedAt),
    tasks,
  };
}

/** The meeting as the day page shows it: the saved notes and tasks only after "Save notes". */
export async function dayMeetingView(
  db: DbOrTx,
  group: GroupRow,
  date: string,
): Promise<StandupDayMeeting | null> {
  const row = await findMeeting(db, group.id, date);
  if (!row?.startedAt) return null;
  const saved = row.notesSavedAt !== null;
  const [people, tasks] = await Promise.all([
    standupPeople(db, group.workspaceId, row.facilitatorId ? [row.facilitatorId] : []),
    saved ? meetingTasks(db, group.workspaceId, row.id) : Promise.resolve([]),
  ]);
  return {
    id: row.id,
    facilitator: row.facilitatorId ? (people.get(row.facilitatorId)?.user ?? null) : null,
    startedAt: iso(row.startedAt),
    endedAt: iso(row.endedAt),
    live: row.endedAt === null,
    totalSeconds: row.totalSeconds,
    notesSavedAt: iso(row.notesSavedAt),
    notes: saved ? (row.notes ?? '') : null,
    tasks,
  };
}

/**
 * 409/400 unless a meeting can start on `date`: the group's today, a standup day, a meeting time
 * set, not archived.
 */
async function assertMeetingDay(tx: DbOrTx, group: GroupRow, date: string, now: Date) {
  if (group.archivedAt) throw httpError(409, 'GROUP_ARCHIVED', 'This standup group is archived');
  const today = groupToday(group, now);
  if (date > today) throw httpError(400, 'INVALID_DATE', 'That day hasn’t started yet');
  if (date < today) {
    throw httpError(409, 'STANDUP_DAY_CLOSED', 'A meeting can only run on its own day');
  }
  if (!group.meetingAt) {
    throw httpError(409, 'MEETING_NOT_SCHEDULED', 'This group has no meeting (async only)');
  }
  if (!isStandupDay(group, date, await holidaySet(tx, group.workspaceId))) {
    throw httpError(409, 'NOT_STANDUP_DAY', 'The group has no standup on this day');
  }
}

/** Starts the day's meeting (idempotent while it runs): fixes the order, the first speaker talks. */
export async function startMeeting(
  tx: DbOrTx,
  group: GroupRow,
  userId: string,
  date: string,
  now: Date,
): Promise<{ row: MeetingRow; changed: boolean }> {
  await assertMeetingDay(tx, group, date, now);
  const existing = await findMeeting(tx, group.id, date, { lock: true });
  if (existing?.endedAt) throw httpError(409, 'MEETING_ENDED', 'Today’s meeting has ended');
  if (existing?.startedAt) return { row: existing, changed: false };

  const memberIds = await activeGroupMemberIds(tx, group);
  const facts = await dayFacts(tx, group, date, memberIds);
  const order = await speakingOrder(tx, group.speakingOrder, memberIds, facts);
  const first = order.find((id) => !isSkipped(facts, id));
  if (!first) throw httpError(409, 'NO_SPEAKERS', 'Everyone in the group is out of office today');
  const values = {
    facilitatorId: userId,
    startedAt: now,
    speakingOrder: order,
    currentUserId: first,
    currentStartedAt: now,
    durations: {},
    updatedAt: now,
  };
  const [row] = existing
    ? await tx
        .update(standupMeetings)
        .set(values)
        .where(eq(standupMeetings.id, existing.id))
        .returning()
    : await tx
        .insert(standupMeetings)
        .values({ groupId: group.id, date, ...values })
        .returning();
  if (!row) throw httpError(500, 'INTERNAL', 'Could not start the meeting');
  return { row, changed: true };
}

/** The running turn's seconds folded into `durations`. */
function closeTurn(row: MeetingRow, now: Date): Record<string, number> {
  const durations = { ...row.durations };
  if (row.currentUserId && row.currentStartedAt) {
    durations[row.currentUserId] =
      (durations[row.currentUserId] ?? 0) + secondsBetween(row.currentStartedAt, now);
  }
  return durations;
}

async function runningMeeting(tx: DbOrTx, group: GroupRow, date: string): Promise<MeetingRow> {
  const row = await findMeeting(tx, group.id, date, { lock: true });
  if (!row?.startedAt) throw httpError(409, 'MEETING_NOT_STARTED', 'The meeting hasn’t started');
  if (row.endedAt) throw httpError(409, 'MEETING_ENDED', 'Today’s meeting has ended');
  return row;
}

/** Moves the meeting to `toUserId` (in the order and not skipped); their time continues. */
export async function advanceMeeting(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  toUserId: string,
  now: Date,
): Promise<{ row: MeetingRow; changed: boolean }> {
  const row = await runningMeeting(tx, group, date);
  if (row.currentUserId === toUserId) return { row, changed: false };
  if (!row.speakingOrder.includes(toUserId)) {
    throw httpError(400, 'INVALID_SPEAKER', 'That person isn’t in this meeting');
  }
  const facts = await dayFacts(tx, group, date, [toUserId]);
  if (isSkipped(facts, toUserId)) {
    throw httpError(400, 'INVALID_SPEAKER', 'That person is out of office today');
  }
  const [updated] = await tx
    .update(standupMeetings)
    .set({
      durations: closeTurn(row, now),
      currentUserId: toUserId,
      currentStartedAt: now,
      updatedAt: now,
    })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  if (!updated) throw httpError(500, 'INTERNAL', 'Could not update the meeting');
  return { row: updated, changed: true };
}

/** Ends the meeting (idempotent): the last turn is counted, the total stored. */
export async function endMeeting(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  now: Date,
): Promise<{ row: MeetingRow; changed: boolean }> {
  const row = await findMeeting(tx, group.id, date, { lock: true });
  if (!row?.startedAt) throw httpError(409, 'MEETING_NOT_STARTED', 'The meeting hasn’t started');
  if (row.endedAt) return { row, changed: false };
  const [updated] = await tx
    .update(standupMeetings)
    .set({
      durations: closeTurn(row, now),
      currentUserId: null,
      currentStartedAt: null,
      endedAt: now,
      totalSeconds: secondsBetween(row.startedAt, now),
      updatedAt: now,
    })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  if (!updated) throw httpError(500, 'INTERNAL', 'Could not end the meeting');
  return { row: updated, changed: true };
}

async function startedMeeting(tx: DbOrTx, group: GroupRow, date: string): Promise<MeetingRow> {
  const row = await findMeeting(tx, group.id, date, { lock: true });
  if (!row?.startedAt) throw httpError(409, 'MEETING_NOT_STARTED', 'The meeting hasn’t started');
  return row;
}

/** Autosaved notes (during or after the meeting). A no-op save writes nothing. */
export async function updateMeetingNotes(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  notes: string,
  now: Date,
): Promise<{ row: MeetingRow; changed: boolean }> {
  const row = await startedMeeting(tx, group, date);
  if ((row.notes ?? '') === notes) return { row, changed: false };
  const [updated] = await tx
    .update(standupMeetings)
    .set({ notes, updatedAt: now })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  if (!updated) throw httpError(500, 'INTERNAL', 'Could not save the notes');
  return { row: updated, changed: true };
}

/** "Save notes to standup": the notes and created tasks show on the day page from now on. */
export async function saveMeetingNotes(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  notes: string | undefined,
  now: Date,
): Promise<MeetingRow> {
  const row = await startedMeeting(tx, group, date);
  const [updated] = await tx
    .update(standupMeetings)
    .set({ ...(notes !== undefined ? { notes } : {}), notesSavedAt: now, updatedAt: now })
    .where(eq(standupMeetings.id, row.id))
    .returning();
  if (!updated) throw httpError(500, 'INTERNAL', 'Could not save the notes');
  return updated;
}

/**
 * Lists a task made with "Create task" under the meeting, with the item it came from (a posted
 * update of that day in the group; a blocker of it, or a Today item index). Idempotent. Writes no
 * task activity or references: the task was created through the normal route.
 */
export async function addMeetingTask(
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  input: AddStandupMeetingTask,
  now: Date,
): Promise<{ row: MeetingRow; changed: boolean }> {
  const row = await startedMeeting(tx, group, date);
  await assertLinkedTasks(tx, group.workspaceId, [input.taskId]);
  const [entry] = await tx
    .select()
    .from(standupEntries)
    .where(
      and(
        eq(standupEntries.id, input.sourceEntryId),
        eq(standupEntries.groupId, group.id),
        eq(standupEntries.date, date),
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
