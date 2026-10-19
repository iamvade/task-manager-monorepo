import { z } from 'zod';
import { dateSchema } from '../dates.js';
import {
  meetingTaskSourceSchema,
  paletteKeySchema,
  speakingOrderSchema,
  standupEntryStatusSchema,
  standupReactionSchema,
  standupSuggestionKindSchema,
  standupTodayTagSchema,
  statusCategorySchema,
} from '../enums.js';
import { absenceRefSchema } from './absence.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch, userRefSchema } from './common.js';

/** Seconds per speaker in the meeting (1 / 2 / 3 min). */
export const SECONDS_PER_PERSON = [60, 120, 180] as const;
export const MAX_STANDUP_MEMBERS = 50;
/** Above this many active members, admins and the facilitator are nudged to split the group. */
export const STANDUP_SPLIT_THRESHOLD = 12;

/** A wall-clock time in the group's zone, `HH:mm` on a 15-minute step. */
export const standupTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Use HH:mm on a 15-minute step');

/** Every 15-minute step of a day, for the schedule selects. */
export const STANDUP_TIMES: readonly string[] = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

export const standupGroupNameSchema = z.string().trim().min(1).max(60);

const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'Unknown time zone');

const daysSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, 'Pick at least one day')
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

/** Items of a posted update (stored as jsonb on `standup_entries`). */
export const standupYesterdayItemSchema = z
  .object({
    kind: z.enum(['completed', 'review', 'commented', 'text']),
    taskId: z.uuid().optional(),
    text: z.string().max(500),
  })
  .meta({ id: 'StandupYesterdayItem' });
export type StandupYesterdayItem = z.infer<typeof standupYesterdayItemSchema>;

export const standupTodayItemSchema = z
  .object({
    kind: z.enum(['task', 'text']),
    taskId: z.uuid().optional(),
    text: z.string().max(500),
  })
  .meta({ id: 'StandupTodayItem' });
export type StandupTodayItem = z.infer<typeof standupTodayItemSchema>;

export const standupGroupMemberSchema = z
  .object({
    user: userRefSchema,
    /** Workspace job title. */
    title: z.string().nullable(),
    position: z.string(),
    absences: z.array(absenceRefSchema),
  })
  .meta({ id: 'StandupGroupMember' });
export type StandupGroupMember = z.infer<typeof standupGroupMemberSchema>;

export const standupGroupSchema = z
  .object({
    id: z.uuid(),
    workspaceId: z.uuid(),
    name: z.string(),
    timezone: z.string(),
    /** Weekdays the group meets, Monday = 0 … Sunday = 6. */
    days: z.array(z.number().int()),
    postBy: z.string(),
    /** Null = no reminder. */
    reminderAt: z.string().nullable(),
    /** Null = no meeting (async only). */
    meetingAt: z.string().nullable(),
    facilitatorId: z.uuid().nullable(),
    speakingOrder: speakingOrderSchema,
    secondsPerPerson: z.number().int(),
    totalMeetingMinutes: z.number().int(),
    showBlockersFirst: z.boolean(),
    markLinkedTasksBlocked: z.boolean(),
    createdAt: z.iso.datetime(),
    archivedAt: z.iso.datetime().nullable(),
    /** Active workspace members in the group, by position. */
    members: z.array(standupGroupMemberSchema),
    /** Whether the caller is in the group. */
    isMember: z.boolean(),
    /** Whether the caller may edit settings and members (admins, owners, the facilitator). */
    canEdit: z.boolean(),
    /** The group's local date now. */
    today: dateSchema,
    /** Today is one of the group's standup days (and not a holiday). */
    meetsToday: z.boolean(),
    /** The caller posted today's update. */
    myPosted: z.boolean(),
    /** Anyone ever posted (the empty state shows until then). */
    hasPosts: z.boolean(),
  })
  .meta({ id: 'StandupGroup' });
export type StandupGroup = z.infer<typeof standupGroupSchema>;

const timeOrder = (g: { postBy?: string; reminderAt?: string | null; meetingAt?: string | null }) =>
  (g.reminderAt == null || g.postBy === undefined || g.reminderAt < g.postBy) &&
  (g.meetingAt == null || g.postBy === undefined || g.postBy <= g.meetingAt);
const TIME_ORDER = {
  message: 'The reminder must be before the post-by time, and the meeting at or after it',
  path: ['postBy'],
};

/** `POST /workspaces/:id/standup-groups` (admins). The other settings start at their defaults. */
export const createStandupGroupSchema = z
  .object({
    name: standupGroupNameSchema,
    /** Defaults to the creator only; the creator becomes facilitator unless they aren't listed. */
    memberIds: z.array(z.uuid()).max(MAX_STANDUP_MEMBERS).optional(),
  })
  .strict()
  .meta({ id: 'CreateStandupGroup' });
export type CreateStandupGroup = z.infer<typeof createStandupGroupSchema>;

/** `PATCH /standup-groups/:id` (admins, owners, facilitator): the settings page's Save. */
export const updateStandupGroupSchema = z
  .object({
    name: standupGroupNameSchema,
    days: daysSchema,
    timezone: timezoneSchema,
    postBy: standupTimeSchema,
    reminderAt: standupTimeSchema.nullable(),
    meetingAt: standupTimeSchema.nullable(),
    facilitatorId: z.uuid().nullable(),
    speakingOrder: speakingOrderSchema,
    secondsPerPerson: z.union([z.literal(60), z.literal(120), z.literal(180)]),
    totalMeetingMinutes: z.number().int().min(5).max(120),
    showBlockersFirst: z.boolean(),
    markLinkedTasksBlocked: z.boolean(),
    /** The full member list in order; replaces the current one. */
    memberIds: z.array(z.uuid()).max(MAX_STANDUP_MEMBERS),
  })
  .partial()
  .strict()
  .refine(nonEmptyPatch, NOTHING_TO_UPDATE)
  .refine(timeOrder, TIME_ORDER)
  .meta({ id: 'UpdateStandupGroup' });
export type UpdateStandupGroup = z.input<typeof updateStandupGroupSchema>;

/** Whether a group's three times are in order (the PATCH re-checks after merging with the row). */
export const standupTimesInOrder = (g: {
  postBy: string;
  reminderAt: string | null;
  meetingAt: string | null;
}) => timeOrder(g);

// ── Entries, blockers, reactions, replies ───────────────────────────────────────────────────

/** A task linked from a standup item, blocker or suggestion. */
export const standupTaskRefSchema = z
  .object({
    id: z.uuid(),
    /** `APP-142`. */
    key: z.string(),
    title: z.string(),
    project: z.object({
      id: z.uuid(),
      key: z.string(),
      name: z.string(),
      color: paletteKeySchema,
    }),
    statusCategory: statusCategorySchema,
  })
  .meta({ id: 'StandupTaskRef' });
export type StandupTaskRef = z.infer<typeof standupTaskRefSchema>;

export const standupYesterdayItemViewSchema = standupYesterdayItemSchema
  .extend({
    /** Null when no task is linked or the task was deleted (`text` still shows). */
    task: standupTaskRefSchema.nullable(),
  })
  .meta({ id: 'StandupYesterdayItemView' });
export type StandupYesterdayItemView = z.infer<typeof standupYesterdayItemViewSchema>;

export const standupTodayItemViewSchema = standupTodayItemSchema
  .extend({ task: standupTaskRefSchema.nullable() })
  .meta({ id: 'StandupTodayItemView' });
export type StandupTodayItemView = z.infer<typeof standupTodayItemViewSchema>;

export const standupReplySchema = z
  .object({
    id: z.uuid(),
    entryId: z.uuid(),
    /** Set when it answers one blocker of the update. */
    blockerId: z.uuid().nullable(),
    author: userRefSchema,
    /** Plain text; `@Name` of each mentioned person appears in it. */
    body: z.string(),
    mentions: z.array(userRefSchema),
    createdAt: z.iso.datetime(),
    editedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: 'StandupReply' });
export type StandupReply = z.infer<typeof standupReplySchema>;

export const standupBlockerSchema = z
  .object({
    id: z.uuid(),
    entryId: z.uuid(),
    /** The standup day of the update it was posted in ("since Oct 8" on later days). */
    date: dateSchema,
    text: z.string(),
    author: userRefSchema,
    task: standupTaskRefSchema.nullable(),
    /** "Can help" (group members). */
    helpers: z.array(userRefSchema),
    resolvedAt: z.iso.datetime().nullable(),
    resolvedBy: userRefSchema.nullable(),
    /** The caller may resolve or reopen it (author, helpers, facilitator, admins in the group). */
    canResolve: z.boolean(),
    createdAt: z.iso.datetime(),
    /** Replies that answer this blocker, oldest first (also in the entry's `replies`). */
    replies: z.array(standupReplySchema),
  })
  .meta({ id: 'StandupBlocker' });
export type StandupBlocker = z.infer<typeof standupBlockerSchema>;

export const standupReactionSummarySchema = z
  .object({
    emoji: standupReactionSchema,
    count: z.number().int(),
    /** The caller reacted with it. */
    mine: z.boolean(),
    /** Who reacted with it, earliest first. */
    users: z.array(userRefSchema),
  })
  .meta({ id: 'StandupReactionSummary' });
export type StandupReactionSummary = z.infer<typeof standupReactionSummarySchema>;

export const standupEntrySchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    user: userRefSchema,
    /** Workspace job title. */
    title: z.string().nullable(),
    date: dateSchema,
    status: standupEntryStatusSchema,
    postedAt: z.iso.datetime().nullable(),
    editedAt: z.iso.datetime().nullable(),
    /** Posted after the group's post-by time that day (shown for that day only). */
    isLate: z.boolean(),
    yesterday: z.array(standupYesterdayItemViewSchema),
    today: z.array(standupTodayItemViewSchema),
    /** In the order written. */
    blockers: z.array(standupBlockerSchema),
    /** All three reactions, in display order. */
    reactions: z.array(standupReactionSummarySchema),
    /** Oldest first. */
    replies: z.array(standupReplySchema),
  })
  .meta({ id: 'StandupEntry' });
export type StandupEntry = z.infer<typeof standupEntrySchema>;

export const STANDUP_MEMBER_STATES = ['posted', 'not_yet', 'out'] as const;

export const standupDayMemberSchema = z
  .object({
    user: userRefSchema,
    title: z.string().nullable(),
    /** `out` = out of office that day and hasn't posted (left out of the count). */
    state: z.enum(STANDUP_MEMBER_STATES),
    postedAt: z.iso.datetime().nullable(),
    isLate: z.boolean(),
    /** When out: the first standup day after the absence ("back Oct 12"). */
    backOn: dateSchema.nullable(),
  })
  .meta({ id: 'StandupDayMember' });
export type StandupDayMember = z.infer<typeof standupDayMemberSchema>;

// ── Meetings ────────────────────────────────────────────────────────────────────────────────

/** A task made with "Create task" in a meeting, and the item it came from. */
export const standupMeetingTaskSchema = z
  .object({
    task: standupTaskRefSchema,
    /** The task's first assignee. */
    assignee: userRefSchema.nullable(),
    source: z.object({
      /** Whose update it came from (null when that account is gone). */
      user: userRefSchema.nullable(),
      kind: meetingTaskSourceSchema,
      entryId: z.uuid().nullable(),
      blockerId: z.uuid().nullable(),
      /** `today`: the item's index in the update's Today list. */
      itemIndex: z.number().int().nullable(),
    }),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'StandupMeetingTask' });
export type StandupMeetingTask = z.infer<typeof standupMeetingTaskSchema>;

export const standupMeetingSpeakerSchema = z
  .object({
    user: userRefSchema,
    title: z.string().nullable(),
    /** As of the meeting's day; `out` people are listed last and skipped. */
    state: z.enum(['posted', 'not_yet', 'out']),
    postedAt: z.iso.datetime().nullable(),
    /** Their posted update that day. */
    entryId: z.uuid().nullable(),
  })
  .meta({ id: 'StandupMeetingSpeaker' });
export type StandupMeetingSpeaker = z.infer<typeof standupMeetingSpeakerSchema>;

/**
 * A standup day's meeting. The live state is the server's: the current person's time is
 * `durations[currentUserId] + (now − currentStartedAt)`, the total the sum of `durations` plus
 * that running turn. Timing is shown in live mode only and never feeds Reports.
 */
export const standupMeetingSchema = z
  .object({
    id: z.uuid(),
    groupId: z.uuid(),
    date: dateSchema,
    /** Who started it (drives it). */
    facilitator: userRefSchema.nullable(),
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    /** Everyone in speaking order, fixed at start; out of office last. */
    order: z.array(standupMeetingSpeakerSchema),
    currentUserId: z.uuid().nullable(),
    currentStartedAt: z.iso.datetime().nullable(),
    /** Seconds of finished turns, by user id. */
    durations: z.record(z.string(), z.number()),
    /** Wall-clock length, set at the end. */
    totalSeconds: z.number().int().nullable(),
    notes: z.string(),
    /** When the notes were last saved to the standup page (null = not shown there). */
    notesSavedAt: z.iso.datetime().nullable(),
    /** Oldest first. */
    tasks: z.array(standupMeetingTaskSchema),
  })
  .meta({ id: 'StandupMeeting' });
export type StandupMeeting = z.infer<typeof standupMeetingSchema>;

/** `GET …/days/:date/meeting` and every meeting write. */
export const standupMeetingStateSchema = z
  .object({
    /** Null until someone starts it. */
    meeting: standupMeetingSchema.nullable(),
    /**
     * The caller may start and drive it: the facilitator, or (when the group has none or they're
     * out of office that day) admins and owners in the group. Everyone else in the group follows.
     */
    canDrive: z.boolean(),
    /** For the client's clock offset. */
    serverNow: z.iso.datetime(),
  })
  .meta({ id: 'StandupMeetingState' });
export type StandupMeetingState = z.infer<typeof standupMeetingStateSchema>;

export const advanceStandupMeetingSchema = z
  .object({ toUserId: z.uuid() })
  .strict()
  .meta({ id: 'AdvanceStandupMeeting' });
export type AdvanceStandupMeeting = z.infer<typeof advanceStandupMeetingSchema>;

export const MAX_MEETING_NOTES = 20_000;
const meetingNotesSchema = z.string().max(MAX_MEETING_NOTES);

export const updateStandupMeetingSchema = z
  .object({ notes: meetingNotesSchema })
  .strict()
  .meta({ id: 'UpdateStandupMeeting' });
export type UpdateStandupMeeting = z.infer<typeof updateStandupMeetingSchema>;

/** "Save notes to standup" (optionally with the latest text, so nothing waits on autosave). */
export const saveStandupMeetingNotesSchema = z
  .object({ notes: meetingNotesSchema.optional() })
  .strict()
  .meta({ id: 'SaveStandupMeetingNotes' });
export type SaveStandupMeetingNotes = z.infer<typeof saveStandupMeetingNotesSchema>;

export const addStandupMeetingTaskSchema = z
  .object({
    taskId: z.uuid(),
    sourceKind: meetingTaskSourceSchema,
    /** The posted update of that day it came from. */
    sourceEntryId: z.uuid(),
    /** `blocker`: one of that update's blockers. */
    sourceBlockerId: z.uuid().optional(),
    /** `today`: the item's index in the update's Today list. */
    sourceItemIndex: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((b) => (b.sourceKind === 'blocker') === (b.sourceBlockerId !== undefined), {
    message: 'A blocker source needs sourceBlockerId (and only it)',
    path: ['sourceBlockerId'],
  })
  .refine((b) => (b.sourceKind === 'today') === (b.sourceItemIndex !== undefined), {
    message: 'A Today source needs sourceItemIndex (and only it)',
    path: ['sourceItemIndex'],
  })
  .meta({ id: 'AddStandupMeetingTask' });
export type AddStandupMeetingTask = z.infer<typeof addStandupMeetingTaskSchema>;

/** The meeting as the day page shows it. */
export const standupDayMeetingSchema = z
  .object({
    id: z.uuid(),
    facilitator: userRefSchema.nullable(),
    startedAt: z.iso.datetime().nullable(),
    endedAt: z.iso.datetime().nullable(),
    /** Started and not ended ("Join live"). */
    live: z.boolean(),
    totalSeconds: z.number().int().nullable(),
    /** The saved notes and tasks (null / empty until "Save notes to standup"). */
    notesSavedAt: z.iso.datetime().nullable(),
    notes: z.string().nullable(),
    tasks: z.array(standupMeetingTaskSchema),
  })
  .meta({ id: 'StandupDayMeeting' });
export type StandupDayMeeting = z.infer<typeof standupDayMeetingSchema>;

/** `GET /standup-groups/:id/days/:date`: everything the group page shows for one day. */
export const standupDaySchema = z
  .object({
    group: standupGroupSchema,
    date: dateSchema,
    /** The group's local date now. */
    today: dateSchema,
    isStandupDay: z.boolean(),
    /** The standup days before and after `date` (`nextDate` is null past today). */
    prevDate: dateSchema.nullable(),
    nextDate: dateSchema.nullable(),
    /** The first standup day on or after the group's today ("Next standup Mon, Oct 12"). */
    upcomingDate: dateSchema.nullable(),
    /** The caller can still write or edit their update for this day. */
    editable: z.boolean(),
    /** The post-by and meeting times of that day as instants (null when no meeting). */
    postByAt: z.iso.datetime(),
    meetingAt: z.iso.datetime().nullable(),
    /** Group members by position. */
    members: z.array(standupDayMemberSchema),
    /** Posted, among the members not out of office. */
    postedCount: z.number().int(),
    expectedCount: z.number().int(),
    /** Posted updates: with open blockers first (when `showBlockersFirst`), then by post time. */
    entries: z.array(standupEntrySchema),
    /** Blockers of that day plus ones from earlier days still open; open first. */
    blockers: z.array(standupBlockerSchema),
    /** The caller's update for the day, draft or posted. */
    myEntry: standupEntrySchema.nullable(),
    /** That day's meeting, once started. */
    meeting: standupDayMeetingSchema.nullable(),
  })
  .meta({ id: 'StandupDay' });
export type StandupDay = z.infer<typeof standupDaySchema>;

export const MAX_STANDUP_ITEMS = 20;
export const MAX_STANDUP_BLOCKERS = 10;

export const standupBlockerInputSchema = z
  .object({
    /** An existing blocker of this update (keeps its resolved state and replies); omit for new. */
    id: z.uuid().optional(),
    text: z.string().trim().min(1).max(500),
    taskId: z.uuid().nullable().optional(),
    /** Group members who can help (notified when first named). */
    helperIds: z.array(z.uuid()).max(10).default([]),
  })
  .strict();
export type StandupBlockerInput = z.input<typeof standupBlockerInputSchema>;

/** `PUT /standup-groups/:id/days/:date/entry`: save the draft or post (the whole update). */
export const saveStandupEntrySchema = z
  .object({
    /** `posted` publishes; a posted update can't go back to draft. */
    status: standupEntryStatusSchema,
    yesterday: z.array(standupYesterdayItemSchema).max(MAX_STANDUP_ITEMS).default([]),
    today: z.array(standupTodayItemSchema).max(MAX_STANDUP_ITEMS).default([]),
    blockers: z.array(standupBlockerInputSchema).max(MAX_STANDUP_BLOCKERS).default([]),
  })
  .strict()
  .meta({ id: 'SaveStandupEntry' });
export type SaveStandupEntry = z.input<typeof saveStandupEntrySchema>;

/** A date in the URL: an ISO date or `today` (the group's local date). */
export const standupDateParamSchema = z.union([dateSchema, z.literal('today')]);

export const standupSuggestionsQuerySchema = z.object({
  /** Defaults to the group's today. */
  date: standupDateParamSchema.optional(),
});

/** `GET /standup-groups/:id/suggestions`: Yesterday rows and Today chips for the caller. */
export const standupSuggestionsSchema = z
  .object({
    date: dateSchema,
    /** The previous standup day (null when none in the last 31 days). */
    previousDate: dateSchema.nullable(),
    /** The window of activity: from the previous standup day's post-by time … */
    since: z.iso.datetime(),
    /** … until now (or the end of `date` for a past day). */
    until: z.iso.datetime(),
    /** One row per task with its strongest kind; newest first. */
    yesterday: z.array(
      z.object({
        kind: standupSuggestionKindSchema,
        task: standupTaskRefSchema,
        at: z.iso.datetime(),
      }),
    ),
    /** My open tasks: overdue, then due today, then in progress (each task once). */
    today: z.array(z.object({ tag: standupTodayTagSchema, task: standupTaskRefSchema })),
  })
  .meta({ id: 'StandupSuggestions' });
export type StandupSuggestions = z.infer<typeof standupSuggestionsSchema>;

const replyBodySchema = z.string().trim().min(1).max(2000);

export const createStandupReplySchema = z
  .object({
    body: replyBodySchema,
    /** Answer one blocker of the update. */
    blockerId: z.uuid().optional(),
    /** People picked from the @ popup (group members only; others are dropped). */
    mentionIds: z.array(z.uuid()).max(20).default([]),
  })
  .strict()
  .meta({ id: 'CreateStandupReply' });
export type CreateStandupReply = z.input<typeof createStandupReplySchema>;

export const updateStandupReplySchema = z
  .object({ body: replyBodySchema, mentionIds: z.array(z.uuid()).max(20).default([]) })
  .strict()
  .meta({ id: 'UpdateStandupReply' });
export type UpdateStandupReply = z.input<typeof updateStandupReplySchema>;
