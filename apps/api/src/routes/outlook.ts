import {
  apiErrorSchema,
  connectOutlookSchema,
  daysBetween,
  OUTLOOK_MAX_RANGE_DAYS,
  outlookBusySchema,
  outlookConnectionSchema,
  outlookEventsSchema,
  outlookRangeQuerySchema,
  type OutlookConnection,
} from '@kite/shared';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { activeMember } from '../auth/membership.js';
import { requireAuth } from '../auth/plugin.js';
import { outlookCalendars, workspaceMembers } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { IcsFetchError, normalizeOutlookLink } from '../outlook/fetch.js';
import { clientIdOf } from '../realtime/client-id.js';

const err = apiErrorSchema;
const TAGS = ['Outlook'];
const OWNER_ONLY = 'Mine only (the platform admin gets 404). The link itself is never returned.';

/** The platform admin has no calendar of its own here (like the personal space). */
function requireOwner(request: FastifyRequest) {
  const auth = requireAuth(request);
  if (auth.user.platformRole !== null) throw httpError(404, 'NOT_FOUND', 'Not found');
  return auth;
}

function requireRange(from: string, to: string) {
  if (daysBetween(from, to) + 1 > OUTLOOK_MAX_RANGE_DAYS) {
    throw httpError(400, 'INVALID_RANGE', `At most ${String(OUTLOOK_MAX_RANGE_DAYS)} days`);
  }
}

const FETCH_FAILED: Record<IcsFetchError['code'], string> = {
  unreachable: 'OUTLOOK_UNREACHABLE',
  not_found: 'OUTLOOK_NOT_FOUND',
  not_calendar: 'OUTLOOK_NOT_CALENDAR',
  too_large: 'OUTLOOK_TOO_LARGE',
};

function publishChanged(app: FastifyInstance, request: FastifyRequest, userId: string) {
  app.realtime.broadcaster.publish({
    to: { userId, anyWorkspace: true },
    exceptClientId: clientIdOf(request),
    message: { type: 'outlook.changed' },
  });
}

const hostOf = (url: string) => new URL(url).hostname;

export const outlookRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  async function connection(userId: string): Promise<OutlookConnection> {
    const row = await app.outlook.row(userId);
    return {
      connected: Boolean(row),
      host: row ? hostOf(row.url) : null,
      connectedAt: row?.createdAt.toISOString() ?? null,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      lastError: (row?.lastError as OutlookConnection['lastError']) ?? null,
    };
  }

  app.get(
    '/me/outlook-calendar',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'My Outlook calendar link',
        description: `Whether I connected a published Outlook calendar, its host and the last fetch. ${OWNER_ONLY}`,
        response: { 200: outlookConnectionSchema, 401: err, 404: err },
      },
    },
    async (request) => connection(requireOwner(request).user.id),
  );

  app.put(
    '/me/outlook-calendar',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Connect (or replace) my Outlook calendar link',
        description: `The ICS link Outlook gives when publishing a calendar (https or webcal) on \`outlook.office365.com\`, \`outlook.office.com\` or \`outlook.live.com\`; anything else is 400 \`INVALID_OUTLOOK_LINK\`. The link is fetched before saving: 400 \`OUTLOOK_UNREACHABLE\` / \`OUTLOOK_NOT_FOUND\` / \`OUTLOOK_NOT_CALENDAR\` / \`OUTLOOK_TOO_LARGE\` when that fails. ${OWNER_ONLY}`,
        body: connectOutlookSchema,
        response: { 200: outlookConnectionSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireOwner(request);
      const url = normalizeOutlookLink(request.body.url);
      if (!url) {
        throw httpError(400, 'INVALID_OUTLOOK_LINK', 'Not a published Outlook calendar link');
      }
      let text: string;
      try {
        text = await app.outlook.probe(url);
      } catch (e) {
        if (!(e instanceof IcsFetchError)) throw e;
        throw httpError(400, FETCH_FAILED[e.code], 'The calendar link could not be read');
      }
      const now = app.clock();
      await app.db
        .insert(outlookCalendars)
        .values({ userId: user.id, url, lastSyncedAt: now, lastError: null })
        .onConflictDoUpdate({
          target: outlookCalendars.userId,
          set: { url, updatedAt: now, lastSyncedAt: now, lastError: null },
        });
      app.outlook.remember(user.id, url, text);
      publishChanged(app, request, user.id);
      return connection(user.id);
    },
  );

  app.delete(
    '/me/outlook-calendar',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'Disconnect my Outlook calendar',
        description: `Forgets the link; teammates stop seeing my busy time. ${OWNER_ONLY}`,
        response: { 204: z.null(), 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requireOwner(request);
      await app.db.delete(outlookCalendars).where(eq(outlookCalendars.userId, user.id));
      app.outlook.forget(user.id);
      publishChanged(app, request, user.id);
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/me/outlook-calendar/events',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'My Outlook events in a date range',
        description: `Occurrences overlapping \`from\`–\`to\` (dates, inclusive, at most ${String(OUTLOOK_MAX_RANGE_DAYS)} days; a day of margin on each side for time zones), recurrences expanded, cancelled ones left out. The link is fetched again after 10 minutes; \`refresh=true\` fetches it now. When a fetch fails, \`lastError\` is set and the last good copy is returned. ${OWNER_ONLY}`,
        querystring: outlookRangeQuerySchema.and(
          z.object({ refresh: z.enum(['true', 'false']).optional() }),
        ),
        response: { 200: outlookEventsSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { user } = requireOwner(request);
      const { from, to, refresh } = request.query;
      requireRange(from, to);
      const loaded = await app.outlook.load(user.id, { force: refresh === 'true' });
      return {
        connected: loaded.connected,
        events: app.outlook.events(user.id, loaded.text, from, to),
        lastSyncedAt: loaded.lastSyncedAt?.toISOString() ?? null,
        lastError: loaded.lastError,
      };
    },
  );

  app.get(
    '/workspaces/:workspaceId/members/:userId/outlook-busy',
    {
      preHandler: app.authenticate,
      schema: {
        tags: TAGS,
        summary: 'A teammate’s busy time from their Outlook calendar',
        description: `Start, end and free/busy state only: never titles, places or ids, and free time is left out. Both the caller and the person must be active members of the workspace (404 otherwise). \`connected: false\` when they haven't connected a calendar. Range rules as for my events.`,
        params: z.object({ workspaceId: z.uuid(), userId: z.uuid() }),
        querystring: outlookRangeQuerySchema,
        response: { 200: outlookBusySchema, 400: err, 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId, userId } = request.params;
      const { from, to } = request.query;
      await requireWorkspaceMember(request, workspaceId);
      requireRange(from, to);
      const [target] = await app.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId),
            activeMember,
          ),
        )
        .limit(1);
      if (!target) throw httpError(404, 'NOT_FOUND', 'Member not found');
      const loaded = await app.outlook.load(userId);
      const blocks = app.outlook
        .events(userId, loaded.text, from, to)
        .filter((e) => e.showAs !== 'free')
        .map(({ allDay, start, end, showAs }) => ({ allDay, start, end, showAs }));
      return { connected: loaded.connected, blocks };
    },
  );

  done();
};
