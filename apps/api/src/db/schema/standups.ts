import type { StandupTodayItem, StandupYesterdayItem } from '@kite/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, position, timestamptz } from './columns.js';
import {
  meetingTaskSourceEnum,
  speakingOrderEnum,
  standupEntryStatusEnum,
  standupReactionEnum,
} from './enums.js';
import { tasks } from './tasks.js';
import { users } from './users.js';
import { workspaces } from './workspaces.js';

/**
 * A team that posts daily standups on a schedule. Times are wall-clock in `timezone`; members in
 * other zones see them converted. Standup content never feeds Reports or any metric.
 */
export const standupGroups = pgTable(
  'standup_groups',
  {
    id: id(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('Asia/Ulaanbaatar'),
    /** Weekdays, Monday = 0 … Sunday = 6. */
    days: smallint('days')
      .array()
      .notNull()
      .default(sql`'{0,1,2,3,4}'::smallint[]`),
    postBy: time('post_by').notNull().default('10:00'),
    /** Null = no reminder. */
    reminderAt: time('reminder_at').default('09:30'),
    /** Null = no meeting (async only). */
    meetingAt: time('meeting_at').default('10:15'),
    facilitatorId: uuid('facilitator_id').references(() => users.id, { onDelete: 'set null' }),
    speakingOrder: speakingOrderEnum('speaking_order').notNull().default('posting_order'),
    secondsPerPerson: integer('seconds_per_person').notNull().default(120),
    totalMeetingMinutes: integer('total_meeting_minutes').notNull().default(15),
    showBlockersFirst: boolean('show_blockers_first').notNull().default(true),
    markLinkedTasksBlocked: boolean('mark_linked_tasks_blocked').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    archivedAt: timestamptz('archived_at'),
  },
  (t) => [
    index('standup_groups_workspace_id_idx').on(t.workspaceId),
    check(
      'standup_groups_days_check',
      sql`cardinality(${t.days}) > 0 and ${t.days} <@ '{0,1,2,3,4,5,6}'::smallint[]`,
    ),
  ],
);

export const standupGroupMembers = pgTable(
  'standup_group_members',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => standupGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    position: position('position').notNull(),
    /** When they joined the group (earlier days don't list them). */
    addedAt: timestamptz('added_at').notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    unique('standup_group_members_group_id_position_unique').on(t.groupId, t.position),
    index('standup_group_members_user_id_idx').on(t.userId),
  ],
);

/** One person's update for one standup day (`date` is the group's local date). */
export const standupEntries = pgTable(
  'standup_entries',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => standupGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    yesterday: jsonb('yesterday').$type<StandupYesterdayItem[]>().notNull().default([]),
    today: jsonb('today').$type<StandupTodayItem[]>().notNull().default([]),
    status: standupEntryStatusEnum('status').notNull().default('draft'),
    postedAt: timestamptz('posted_at'),
    editedAt: timestamptz('edited_at'),
    /** Posted after the group's post-by time. Shown for that day only, never aggregated. */
    isLate: boolean('is_late').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('standup_entries_group_id_user_id_date_unique').on(t.groupId, t.userId, t.date),
    index('standup_entries_group_id_date_idx').on(t.groupId, t.date),
  ],
);

export const standupBlockers = pgTable(
  'standup_blockers',
  {
    id: id(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => standupEntries.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    /** Who can help. */
    helperIds: uuid('helper_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    resolvedAt: timestamptz('resolved_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('standup_blockers_entry_id_idx').on(t.entryId),
    index('standup_blockers_task_id_idx').on(t.taskId),
    // The task "Blocked" marker reads open blockers by task.
    index('standup_blockers_open_task_id_idx')
      .on(t.taskId)
      .where(sql`${t.resolvedAt} is null`),
  ],
);

export const standupReactions = pgTable(
  'standup_reactions',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => standupEntries.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    emoji: standupReactionEnum('emoji').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.userId, t.emoji] })],
);

export const standupReplies = pgTable(
  'standup_replies',
  {
    id: id(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => standupEntries.id, { onDelete: 'cascade' }),
    blockerId: uuid('blocker_id').references(() => standupBlockers.id, { onDelete: 'set null' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    /** People picked from the @ popup (group members when written). */
    mentionIds: uuid('mention_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: createdAt(),
    editedAt: timestamptz('edited_at'),
  },
  (t) => [index('standup_replies_entry_id_idx').on(t.entryId)],
);

/**
 * Reminders and digests already sent (or skipped): one row per group, person, standup day and
 * kind, so the scheduler never sends one twice, across restarts too.
 */
export const standupNotices = pgTable(
  'standup_notices',
  {
    groupId: uuid('group_id')
      .notNull()
      .references(() => standupGroups.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    kind: text('kind').$type<'reminder' | 'digest'>().notNull(),
    sentAt: timestamptz('sent_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.userId, t.date, t.kind] })],
);

/**
 * A screen-shared meeting for one standup day. Live state is kept here (not on the
 * facilitator's screen), so followers, reloads and other tabs agree: the current speaker,
 * when their current turn started and the seconds everyone spoke so far. Never read by Reports.
 */
export const standupMeetings = pgTable(
  'standup_meetings',
  {
    id: id(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => standupGroups.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    /** Who started (drives) it. */
    facilitatorId: uuid('facilitator_id').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamptz('started_at'),
    endedAt: timestamptz('ended_at'),
    /** Meeting notes (plain text, autosaved). */
    notes: text('notes'),
    /** "Save notes to standup": the notes and created tasks show on the day page from then on. */
    notesSavedAt: timestamptz('notes_saved_at'),
    /** Every group member in speaking order, fixed at start (out of office last). */
    speakingOrder: uuid('speaking_order')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** The person speaking now (null before start and after the end). */
    currentUserId: uuid('current_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** When the current person's running turn started (their time = durations + now − this). */
    currentStartedAt: timestamptz('current_started_at'),
    /** Seconds each person spoke in finished turns, by user id. */
    durations: jsonb('durations').$type<Record<string, number>>().notNull().default({}),
    /** Wall-clock length, stored at the end. */
    totalSeconds: integer('total_seconds'),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [unique('standup_meetings_group_id_date_unique').on(t.groupId, t.date)],
);

/** Tasks created with "Create task" during a meeting, and the item they came from. */
export const standupMeetingTasks = pgTable(
  'standup_meeting_tasks',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => standupMeetings.id, { onDelete: 'cascade' }),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    /** Whose update it came from. */
    sourceUserId: uuid('source_user_id').references(() => users.id, { onDelete: 'set null' }),
    sourceKind: meetingTaskSourceEnum('source_kind').notNull(),
    sourceEntryId: uuid('source_entry_id').references(() => standupEntries.id, {
      onDelete: 'set null',
    }),
    /** `blocker`: the blocker. */
    sourceBlockerId: uuid('source_blocker_id').references(() => standupBlockers.id, {
      onDelete: 'set null',
    }),
    /** `today`: the item's index in the update's Today list. */
    sourceItemIndex: smallint('source_item_index'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.meetingId, t.taskId] }),
    index('standup_meeting_tasks_task_id_idx').on(t.taskId),
  ],
);
