import { z } from 'zod';
import { dateSchema } from '../dates.js';
import { speakingOrderSchema } from '../enums.js';
import { absenceRefSchema } from './absence.js';
import { NOTHING_TO_UPDATE, nonEmptyPatch, userRefSchema } from './common.js';

/** Seconds per speaker in the meeting (1 / 2 / 3 min). */
export const SECONDS_PER_PERSON = [60, 120, 180] as const;
export const MAX_STANDUP_MEMBERS = 50;

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
