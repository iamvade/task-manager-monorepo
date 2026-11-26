import {
  addStandupMeetingTaskSchema,
  apiErrorSchema,
  standupDateParamSchema,
  standupSummaryResultSchema,
  updateStandupSummarySchema,
  type StandupSummaryResult,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { loadStandupGroupAccess } from '../auth/access.js';
import { requireAuth } from '../auth/plugin.js';
import type { DbOrTx } from '../db/client.js';
import { one } from '../db/rows.js';
import { standupGroups, type standupMeetings } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { clientIdOf } from '../realtime/client-id.js';
import { resolveDate } from '../standups/day.js';
import { lockGroup } from '../standups/groups.js';
import { publishSummary } from '../standups/realtime.js';
import {
  addSummaryTask,
  assertSummaryDay,
  mayDrive,
  summaryView,
  updateSummaryNotes,
} from '../standups/summary.js';

const err = apiErrorSchema;
const dayParams = z.object({ groupId: z.uuid(), date: standupDateParamSchema });

const RULES =
  'Only the group’s facilitator may write it, or, when the group has none or they were out of office that day, admins and owners in the group (403 otherwise; other members read it on the day page). For members only (404 outside the workspace). The group’s today or an earlier day that is a standup day or has a posted update: 400 `INVALID_DATE` (later day), 409 `NOT_STANDUP_DAY`, `GROUP_ARCHIVED`. Standup content: never read by Reports or any metric.';

type GroupRow = typeof standupGroups.$inferSelect;
type SummaryRow = typeof standupMeetings.$inferSelect;
type Change = (
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  now: Date,
) => Promise<{ row: SummaryRow | null; changed: boolean }>;

export const standupSummaryRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  /** Loads the group (members), checks the caller facilitates, runs `change` under the group lock. */
  async function write(
    request: FastifyRequest<{ Params: z.infer<typeof dayParams> }>,
    change: Change,
  ): Promise<StandupSummaryResult> {
    const { group, role } = await loadStandupGroupAccess(request, request.params.groupId, {
      member: true,
    });
    const { user } = requireAuth(request);
    const now = app.clock();
    const date = resolveDate(group, request.params.date, now);
    if (!(await mayDrive(app.db, group, user.id, role, date))) {
      throw httpError(403, 'FORBIDDEN', 'Only the facilitator can write the meeting summary');
    }
    const { row, current, changed } = await app.db.transaction(async (tx) => {
      await lockGroup(tx, group.id);
      const current = one(
        await tx.select().from(standupGroups).where(eq(standupGroups.id, group.id)),
        'standup group',
      );
      await assertSummaryDay(tx, current, date, now);
      return { ...(await change(tx, current, date, user.id, now)), current };
    });
    if (changed) {
      await publishSummary(app, current, {
        date,
        actorId: user.id,
        clientId: clientIdOf(request),
      });
    }
    return { summary: row ? await summaryView(app.db, current, row) : null };
  }

  const responses = {
    200: standupSummaryResultSchema,
    400: err,
    401: err,
    403: err,
    404: err,
    409: err,
  };

  app.put(
    '/standup-groups/:groupId/days/:date/summary',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Save the meeting summary',
        description: `The day’s meeting summary (plain text), autosaved from the group page; members see it at once. A no-op save writes nothing. ${RULES}`,
        params: dayParams,
        body: updateStandupSummarySchema,
        response: responses,
      },
    },
    (request) =>
      write(request, (tx, group, date, userId, now) =>
        updateSummaryNotes(tx, group, date, userId, request.body.notes, now),
      ),
  );

  app.post(
    '/standup-groups/:groupId/days/:date/summary/tasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Add a task created from a standup item',
        description: `After “Create task” saved a task through \`POST /projects/:id/tasks\`: lists it under the day’s summary with the item it came from (a Today item of a posted update that day, or a blocker of a posted update from that day or earlier). Idempotent. Writes no task activity or references. 400 \`INVALID_TASK\` (not in the workspace), \`INVALID_SOURCE\`. ${RULES}`,
        params: dayParams,
        body: addStandupMeetingTaskSchema,
        response: responses,
      },
    },
    (request) =>
      write(request, (tx, group, date, userId, now) =>
        addSummaryTask(tx, group, date, userId, request.body, now),
      ),
  );

  done();
};
