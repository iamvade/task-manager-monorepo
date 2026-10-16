import {
  groupToday,
  isStandupDay,
  type SaveStandupEntry,
  type StandupTodayItem,
  type StandupYesterdayItem,
  saveStandupEntrySchema,
} from '@kite/shared';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import type { Tx } from '../db/client.js';
import { one } from '../db/rows.js';
import type { standupGroups } from '../db/schema/index.js';
import { projects, standupBlockers, standupEntries, tasks } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { activeGroupMemberIds, holidaySet, postByInstant } from './schedule.js';

type GroupRow = typeof standupGroups.$inferSelect;
type EntryRow = typeof standupEntries.$inferSelect;
type BlockerRow = typeof standupBlockers.$inferSelect;
type Body = z.output<typeof saveStandupEntrySchema>;

export interface SavedEntry {
  entry: EntryRow;
  /** Anything was written. */
  changed: boolean;
  /** Posted for the first time by this save. */
  posted: boolean;
  /** A posted update was edited. */
  edited: boolean;
  /** Helpers to notify: newly named on a posted blocker. */
  newHelpers: { blockerId: string; userIds: string[] }[];
  /** Tasks whose "Blocked" marker may have changed. */
  blockedTaskIds: string[];
}

/**
 * 409/400 unless `date` is the group's today, a standup day, in a group that isn't archived:
 * updates are written on the day and stay editable until it ends in the group's zone.
 */
export async function assertWritableDay(tx: Tx, group: GroupRow, date: string, now: Date) {
  if (group.archivedAt) throw httpError(409, 'GROUP_ARCHIVED', 'This standup group is archived');
  const today = groupToday(group, now);
  if (date > today) throw httpError(400, 'INVALID_DATE', 'That day hasn’t started yet');
  if (date < today) {
    throw httpError(409, 'STANDUP_DAY_CLOSED', 'Updates can only be changed on their own day');
  }
  if (!isStandupDay(group, date, await holidaySet(tx, group.workspaceId))) {
    throw httpError(409, 'NOT_STANDUP_DAY', 'The group has no standup on this day');
  }
}

const cleanYesterday = (items: StandupYesterdayItem[]): StandupYesterdayItem[] =>
  items.map(({ kind, taskId, text }) => (taskId ? { kind, taskId, text } : { kind, text }));
const cleanToday = (items: StandupTodayItem[]): StandupTodayItem[] =>
  items.map(({ kind, taskId, text }) => (taskId ? { kind, taskId, text } : { kind, text }));

const sameBlocker = (
  row: BlockerRow,
  input: { text: string; taskId: string | null; helperIds: string[] },
) =>
  row.text === input.text &&
  row.taskId === input.taskId &&
  JSON.stringify(row.helperIds) === JSON.stringify(input.helperIds);

/**
 * Saves the caller's update for `date` (the whole update: items and blockers). Posting is one-way;
 * the first post stamps `posted_at` and `is_late`, later saves of a posted update `edited_at`.
 * Blockers keep their id, resolved state and replies across edits; ones left out are deleted.
 * A save that changes nothing writes nothing. No task activity, references or `updated_at`.
 */
export async function saveEntry(
  tx: Tx,
  group: GroupRow,
  userId: string,
  date: string,
  input: SaveStandupEntry,
  now: Date,
): Promise<SavedEntry> {
  const body: Body = saveStandupEntrySchema.parse(input);
  await assertWritableDay(tx, group, date, now);

  const blockersIn = body.blockers.map((b) => ({
    id: b.id,
    text: b.text,
    taskId: b.taskId ?? null,
    helperIds: [...new Set(b.helperIds)],
  }));
  await assertLinkedTasks(tx, group.workspaceId, [
    ...body.yesterday.flatMap((i) => i.taskId ?? []),
    ...body.today.flatMap((i) => i.taskId ?? []),
    ...blockersIn.flatMap((b) => b.taskId ?? []),
  ]);
  const helpers = blockersIn.flatMap((b) => b.helperIds);
  if (helpers.length > 0) {
    const members = new Set(await activeGroupMemberIds(tx, group));
    if (helpers.some((id) => id === userId || !members.has(id))) {
      throw httpError(400, 'INVALID_HELPER', 'Helpers must be other members of the group');
    }
  }

  const [existing] = await tx
    .select()
    .from(standupEntries)
    .where(
      and(
        eq(standupEntries.groupId, group.id),
        eq(standupEntries.userId, userId),
        eq(standupEntries.date, date),
      ),
    )
    .for('update');
  if (existing?.status === 'posted' && body.status === 'draft') {
    throw httpError(409, 'ALREADY_POSTED', 'A posted update can’t go back to draft');
  }
  const oldBlockers = existing
    ? await tx.select().from(standupBlockers).where(eq(standupBlockers.entryId, existing.id))
    : [];
  const oldById = new Map(oldBlockers.map((b) => [b.id, b]));
  if (blockersIn.some((b) => b.id !== undefined && !oldById.has(b.id))) {
    throw httpError(400, 'INVALID_BLOCKER', 'That blocker isn’t part of this update');
  }

  const yesterday = cleanYesterday(body.yesterday);
  const today = cleanToday(body.today);
  const keptIds = new Set(blockersIn.flatMap((b) => b.id ?? []));
  const removed = oldBlockers.filter((b) => !keptIds.has(b.id));
  const blockersChanged =
    removed.length > 0 ||
    blockersIn.some((b) => {
      const old = b.id ? oldById.get(b.id) : undefined;
      return !old || !sameBlocker(old, b);
    });
  const itemsChanged =
    !existing ||
    JSON.stringify(existing.yesterday) !== JSON.stringify(yesterday) ||
    JSON.stringify(existing.today) !== JSON.stringify(today);
  const posting = body.status === 'posted' && existing?.status !== 'posted';
  if (existing && !posting && !itemsChanged && !blockersChanged) {
    return {
      entry: existing,
      changed: false,
      posted: false,
      edited: false,
      newHelpers: [],
      blockedTaskIds: [],
    };
  }

  const wasPosted = existing?.status === 'posted';
  const entry = existing
    ? one(
        await tx
          .update(standupEntries)
          .set({
            yesterday,
            today,
            status: body.status,
            ...(posting && { postedAt: now, isLate: now > postByInstant(group, date) }),
            ...(wasPosted && { editedAt: now }),
          })
          .where(eq(standupEntries.id, existing.id))
          .returning(),
        'standup entry',
      )
    : one(
        await tx
          .insert(standupEntries)
          .values({
            groupId: group.id,
            userId,
            date,
            yesterday,
            today,
            status: body.status,
            postedAt: posting ? now : null,
            isLate: posting && now > postByInstant(group, date),
            createdAt: now,
          })
          .returning(),
        'standup entry',
      );

  if (removed.length > 0) {
    await tx.delete(standupBlockers).where(
      inArray(
        standupBlockers.id,
        removed.map((b) => b.id),
      ),
    );
  }
  const newHelpers: SavedEntry['newHelpers'] = [];
  for (const b of blockersIn) {
    const old = b.id ? oldById.get(b.id) : undefined;
    let id = old?.id;
    if (old && !sameBlocker(old, b)) {
      await tx
        .update(standupBlockers)
        .set({ text: b.text, taskId: b.taskId, helperIds: b.helperIds })
        .where(eq(standupBlockers.id, old.id));
    } else if (!old) {
      id = one(
        await tx
          .insert(standupBlockers)
          .values({
            entryId: entry.id,
            text: b.text,
            taskId: b.taskId,
            helperIds: b.helperIds,
            createdAt: now,
          })
          .returning({ id: standupBlockers.id }),
        'blocker',
      ).id;
    }
    if (body.status === 'posted' && id) {
      // Named on a posted blocker for the first time (a draft's helpers hear about it on posting).
      const before = wasPosted && old ? new Set(old.helperIds) : new Set<string>();
      const fresh = b.helperIds.filter((h) => !before.has(h));
      if (fresh.length > 0) newHelpers.push({ blockerId: id, userIds: fresh });
    }
  }

  // Markers come from open blockers of posted updates in groups that show them.
  const touchesMarkers = group.markLinkedTasksBlocked && (wasPosted || body.status === 'posted');
  const blockedTaskIds = touchesMarkers
    ? [
        ...new Set([
          ...oldBlockers.filter((b) => !b.resolvedAt).flatMap((b) => b.taskId ?? []),
          ...blockersIn.flatMap((b) => {
            const old = b.id ? oldById.get(b.id) : undefined;
            return b.taskId && !old?.resolvedAt ? [b.taskId] : [];
          }),
        ]),
      ]
    : [];
  return { entry, changed: true, posted: posting, edited: wasPosted, newHelpers, blockedTaskIds };
}

/** 400 unless every linked task exists (not deleted) in the group's workspace. */
async function assertLinkedTasks(tx: Tx, workspaceId: string, taskIds: string[]) {
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return;
  const found = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .innerJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(inArray(tasks.id, ids), eq(projects.workspaceId, workspaceId), isNull(tasks.deletedAt)),
    );
  if (found.length !== ids.length) {
    throw httpError(400, 'INVALID_TASK', 'Linked tasks must be in this workspace');
  }
}
