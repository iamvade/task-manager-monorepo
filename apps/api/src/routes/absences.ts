import {
  absenceListQuerySchema,
  absenceSchema,
  apiErrorSchema,
  createAbsenceSchema,
  updateAbsenceSchema,
} from '@kite/shared';
import { and, asc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadAbsenceAccess, requireWorkspaceMember } from '../auth/access.js';
import { activeMember } from '../auth/membership.js';
import { requireAuth } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import { one } from '../db/rows.js';
import { userAbsences, workspaceMembers } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';

const err = apiErrorSchema;
const memberParams = z.object({ workspaceId: z.uuid(), userId: z.uuid() });
const absenceParams = z.object({ workspaceId: z.uuid(), absenceId: z.uuid() });
const WHO =
  'The person themselves, or an admin/owner of a workspace they’re in (403 for other members).';

const toDto = (a: typeof userAbsences.$inferSelect) => ({
  id: a.id,
  userId: a.userId,
  startDate: a.startDate,
  endDate: a.endDate,
  note: a.note,
});

/** 409 `ABSENCE_OVERLAP` when the period overlaps another of the person's absences. */
async function requireNoOverlap(
  db: DbOrTx,
  userId: string,
  period: { startDate: string; endDate: string },
  exceptId?: string,
) {
  const [clash] = await db
    .select({ id: userAbsences.id })
    .from(userAbsences)
    .where(
      and(
        eq(userAbsences.userId, userId),
        lte(userAbsences.startDate, period.endDate),
        gte(userAbsences.endDate, period.startDate),
        exceptId ? ne(userAbsences.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw httpError(409, 'ABSENCE_OVERLAP', 'This overlaps another time off');
}

/**
 * Members, pickers and Workload show absences, and a person's time off is the same in every
 * workspace they're in: tell each of those workspaces and drop their cached reports.
 */
async function absencesChanged(app: FastifyInstance, request: FastifyRequest, userId: string) {
  const memberships = await app.db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), activeMember));
  const actorId = requireAuth(request).user.id;
  const at = new Date().toISOString();
  for (const { workspaceId } of memberships) {
    app.reportCache.invalidate(workspaceId);
    app.realtime.broadcaster.publish({
      to: { workspaceId },
      exceptClientId: clientIdOf(request),
      message: { type: 'absences.changed', workspaceId, userId, actorId, at },
    });
  }
}

export const absenceRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** The target must be an active member of the workspace; others need admin to edit them. */
  async function requireEditable(request: FastifyRequest, workspaceId: string, userId: string) {
    const caller = await requireWorkspaceMember(request, workspaceId);
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
    if (userId !== caller.userId && caller.role === 'member') {
      throw httpError(403, 'FORBIDDEN', 'You can only change your own time off');
    }
  }

  app.get(
    '/workspaces/:workspaceId/members/:userId/absences',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'List a member’s out-of-office periods',
        description:
          'Current and upcoming, by start date (`include=past` adds the ones that ended). Any member may read them; member lists already carry the current ones.',
        params: memberParams,
        querystring: absenceListQuerySchema,
        response: { 200: z.array(absenceSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId, userId } = request.params;
      await requireWorkspaceMember(request, workspaceId);
      const [target] = await app.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
        )
        .limit(1);
      if (!target) throw httpError(404, 'NOT_FOUND', 'Member not found');
      const rows = await app.db
        .select()
        .from(userAbsences)
        .where(
          and(
            eq(userAbsences.userId, userId),
            request.query.include === 'past'
              ? undefined
              : gte(userAbsences.endDate, sql`(current_date - 1)`),
          ),
        )
        .orderBy(asc(userAbsences.startDate));
      return rows.map(toDto);
    },
  );

  app.post(
    '/workspaces/:workspaceId/members/:userId/absences',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Add an out-of-office period',
        description: `${WHO} Both dates included. 409 \`ABSENCE_OVERLAP\` when it overlaps another.`,
        params: memberParams,
        body: createAbsenceSchema,
        response: { 201: absenceSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId, userId } = request.params;
      await requireEditable(request, workspaceId, userId);
      const { startDate, endDate, note } = request.body;
      const created = await app.db.transaction(async (tx) => {
        // One writer per person, so two overlapping inserts can't both pass the check.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`absence:${userId}`}))`);
        await requireNoOverlap(tx, userId, { startDate, endDate });
        return one(
          await tx
            .insert(userAbsences)
            .values({
              userId,
              startDate,
              endDate,
              note: note ?? null,
              createdBy: requireAuth(request).user.id,
            })
            .returning(),
          'absence',
        );
      });
      await absencesChanged(app, request, userId);
      return reply.code(201).send(toDto(created));
    },
  );

  app.patch(
    '/workspaces/:workspaceId/absences/:absenceId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Change an out-of-office period',
        description: `${WHO} 409 \`ABSENCE_OVERLAP\` when it would overlap another; 400 when the end is before the start.`,
        params: absenceParams,
        body: updateAbsenceSchema,
        response: { 200: absenceSchema, 400: err, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request) => {
      const { workspaceId, absenceId } = request.params;
      const absence = await loadAbsenceAccess(request, workspaceId, absenceId);
      const next = {
        startDate: request.body.startDate ?? absence.startDate,
        endDate: request.body.endDate ?? absence.endDate,
        note: request.body.note !== undefined ? request.body.note : absence.note,
      };
      if (next.endDate < next.startDate) {
        throw httpError(400, 'INVALID_DATES', 'The end date is before the start date');
      }
      const updated = await app.db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`absence:${absence.userId}`}))`,
        );
        await requireNoOverlap(tx, absence.userId, next, absence.id);
        return one(
          await tx
            .update(userAbsences)
            .set(next)
            .where(eq(userAbsences.id, absence.id))
            .returning(),
          'absence',
        );
      });
      await absencesChanged(app, request, absence.userId);
      return toDto(updated);
    },
  );

  app.delete(
    '/workspaces/:workspaceId/absences/:absenceId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Workspaces'],
        summary: 'Delete an out-of-office period',
        description: WHO,
        params: absenceParams,
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId, absenceId } = request.params;
      const absence = await loadAbsenceAccess(request, workspaceId, absenceId);
      await app.db.delete(userAbsences).where(eq(userAbsences.id, absence.id));
      await absencesChanged(app, request, absence.userId);
      return reply.code(204).send(null);
    },
  );

  done();
};
