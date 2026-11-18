import { z } from 'zod';
import { dateSchema } from '../dates.js';

/**
 * Outlook calendar: each person pastes the ICS link of a calendar they published in Outlook
 * (Settings → Calendar → Shared calendars → Publish a calendar). The API fetches it, Kite shows
 * the events read-only on the "Outlook calendar" page, and teammates see only busy blocks.
 */

/** The longest range one events request may cover (a month view is at most 42 days). */
export const OUTLOOK_MAX_RANGE_DAYS = 62;

/** How an event shows in Outlook's free/busy (`X-MICROSOFT-CDO-BUSYSTATUS`, else `TRANSP`). */
export const outlookShowAsSchema = z
  .enum(['busy', 'tentative', 'oof', 'elsewhere', 'free'])
  .meta({ id: 'OutlookShowAs' });
export type OutlookShowAs = z.infer<typeof outlookShowAsSchema>;

/** Where the link may point: Outlook's published-calendar hosts, https only (the API checks). */
const linkSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .meta({
    description: 'The ICS link Outlook gives when publishing a calendar (https or webcal).',
  });

export const connectOutlookSchema = z.object({ url: linkSchema }).meta({ id: 'ConnectOutlook' });
export type ConnectOutlookInput = z.infer<typeof connectOutlookSchema>;

/** Why the last fetch failed (shown translated; the link itself is never echoed). */
export const outlookErrorSchema = z
  .enum(['unreachable', 'not_found', 'not_calendar', 'too_large'])
  .meta({ id: 'OutlookError' });
export type OutlookError = z.infer<typeof outlookErrorSchema>;

/** My connection: never the whole link (it is a secret), only its host. */
export const outlookConnectionSchema = z
  .object({
    connected: z.boolean(),
    /** `outlook.office365.com` (work/school) or `outlook.live.com` (personal). */
    host: z.string().nullable(),
    connectedAt: z.iso.datetime().nullable(),
    lastSyncedAt: z.iso.datetime().nullable(),
    lastError: outlookErrorSchema.nullable(),
  })
  .meta({ id: 'OutlookConnection' });
export type OutlookConnection = z.infer<typeof outlookConnectionSchema>;

/**
 * A busy block: what a teammate sees. All-day: `start`/`end` are dates (`end` exclusive, as in
 * iCalendar). Timed: ISO instants.
 */
export const outlookBusyBlockSchema = z
  .object({
    allDay: z.boolean(),
    start: z.string(),
    end: z.string(),
    showAs: outlookShowAsSchema,
  })
  .meta({ id: 'OutlookBusyBlock' });
export type OutlookBusyBlock = z.infer<typeof outlookBusyBlockSchema>;

/** One occurrence of one of my events (a recurring event gives one per occurrence). */
export const outlookEventSchema = outlookBusyBlockSchema
  .extend({
    /** Stable per occurrence: the event's UID and its occurrence start. */
    id: z.string(),
    title: z.string(),
    location: z.string().nullable(),
  })
  .meta({ id: 'OutlookEvent' });
export type OutlookEvent = z.infer<typeof outlookEventSchema>;

export const outlookRangeQuerySchema = z
  .object({ from: dateSchema, to: dateSchema })
  .refine((q) => q.from <= q.to, { message: '`from` must not be after `to`' });

export const outlookEventsSchema = z
  .object({
    connected: z.boolean(),
    events: z.array(outlookEventSchema),
    lastSyncedAt: z.iso.datetime().nullable(),
    /** Set when the latest fetch failed: the events are the last good copy (or none). */
    lastError: outlookErrorSchema.nullable(),
  })
  .meta({ id: 'OutlookEvents' });
export type OutlookEvents = z.infer<typeof outlookEventsSchema>;

/** A teammate's busy time: no titles, places or ids, and free time left out. */
export const outlookBusySchema = z
  .object({
    connected: z.boolean(),
    blocks: z.array(outlookBusyBlockSchema),
  })
  .meta({ id: 'OutlookBusy' });
export type OutlookBusy = z.infer<typeof outlookBusySchema>;
