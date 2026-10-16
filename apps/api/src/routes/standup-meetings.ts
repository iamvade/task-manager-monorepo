import {
  addStandupMeetingTaskSchema,
  advanceStandupMeetingSchema,
  apiErrorSchema,
  saveStandupMeetingNotesSchema,
  standupDateParamSchema,
  standupMeetingStateSchema,
  updateStandupMeetingSchema,
  type StandupMeetingState,
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
import {
  addMeetingTask,
  advanceMeeting,
  endMeeting,
  findMeeting,
  mayDrive,
  meetingView,
  saveMeetingNotes,
  startMeeting,
  updateMeetingNotes,
} from '../standups/meeting.js';
import { publishMeeting } from '../standups/realtime.js';

const err = apiErrorSchema;
const dayParams = z.object({ groupId: z.uuid(), date: standupDateParamSchema });

const MEMBERS =
  'For the group’s members only (403 for other workspace members, 404 outside the workspace).';
const DRIVERS =
  'Only the person driving the meeting may change it: the group’s facilitator, or, when the group has none or they’re out of office that day, admins and owners in the group (403 otherwise). Everyone else in the group follows along read-only.';
const TIMING =
  'Per-person and total times are kept for live mode only: no report, export, Workload or People view reads them.';

type GroupRow = typeof standupGroups.$inferSelect;
type MeetingRow = typeof standupMeetings.$inferSelect;
type Change = (
  tx: DbOrTx,
  group: GroupRow,
  date: string,
  userId: string,
  now: Date,
) => Promise<{ row: MeetingRow; changed: boolean }>;

export const standupMeetingRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  async function state(
    group: GroupRow,
    row: MeetingRow | null,
    canDrive: boolean,
  ): Promise<StandupMeetingState> {
    return {
      meeting: row?.startedAt ? await meetingView(app.db, group, row) : null,
      canDrive,
      serverNow: app.clock().toISOString(),
    };
  }

  /** Loads the group (members), checks the caller drives it, runs `change` under the group lock. */
  async function drive(
    request: FastifyRequest<{ Params: z.infer<typeof dayParams> }>,
    change: Change,
  ): Promise<StandupMeetingState> {
    const { group, role } = await loadStandupGroupAccess(request, request.params.groupId, {
      member: true,
    });
    const { user } = requireAuth(request);
    const now = app.clock();
    const date = resolveDate(group, request.params.date, now);
    if (!(await mayDrive(app.db, group, user.id, role, date))) {
      throw httpError(403, 'FORBIDDEN', 'Only the facilitator can run the meeting');
    }
    const { row, current, changed } = await app.db.transaction(async (tx) => {
      await lockGroup(tx, group.id);
      const current = one(
        await tx.select().from(standupGroups).where(eq(standupGroups.id, group.id)),
        'standup group',
      );
      return { ...(await change(tx, current, date, user.id, now)), current };
    });
    const result = await state(current, row, true);
    if (changed && result.meeting) {
      await publishMeeting(app, current, {
        date,
        meeting: result.meeting,
        actorId: user.id,
        clientId: clientIdOf(request),
      });
    }
    return result;
  }

  const responses = { 200: standupMeetingStateSchema, 400: err, 401: err, 403: err, 404: err };
  const writeResponses = { ...responses, 409: err };

  app.get(
    '/standup-groups/:groupId/days/:date/meeting',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Get a standup meeting',
        description: `The day’s meeting (\`meeting: null\` until someone starts it) and whether the caller drives it (\`canDrive\`). \`serverNow\` lets the client run the timers from the server’s clock. ${TIMING} ${MEMBERS}`,
        params: dayParams,
        response: responses,
      },
    },
    async (request) => {
      const { group, role } = await loadStandupGroupAccess(request, request.params.groupId, {
        member: true,
      });
      const now = app.clock();
      const date = resolveDate(group, request.params.date, now);
      const [row, canDrive] = await Promise.all([
        findMeeting(app.db, group.id, date),
        mayDrive(app.db, group, requireAuth(request).user.id, role, date),
      ]);
      return state(group, row, canDrive);
    },
  );

  app.post(
    '/standup-groups/:groupId/days/:date/meeting/start',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Start the standup meeting',
        description: `Fixes the speaking order from the group’s setting (posting order: posted by time, then the rest by group position; alphabetical; random), with people out of office last (they’re skipped), and starts the first speaker’s timer. Idempotent while the meeting runs. Only on the group’s today: 409 \`STANDUP_DAY_CLOSED\` (earlier day), 400 \`INVALID_DATE\` (later), 409 \`NOT_STANDUP_DAY\`, \`MEETING_NOT_SCHEDULED\` (no meeting time: async only), \`GROUP_ARCHIVED\`, \`MEETING_ENDED\` (no restart), \`NO_SPEAKERS\` (everyone is out). ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, (tx, group, date, userId, now) => startMeeting(tx, group, userId, date, now)),
  );

  app.post(
    '/standup-groups/:groupId/days/:date/meeting/advance',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Move the meeting to another person',
        description: `Previous, Next, or a click on someone in the speaking order. The current turn’s seconds are added to that person’s time; coming back to someone continues their time. 400 \`INVALID_SPEAKER\` for someone not in the order or out of office; 409 \`MEETING_NOT_STARTED\` / \`MEETING_ENDED\`. ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        body: advanceStandupMeetingSchema,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, (tx, group, date, _userId, now) =>
        advanceMeeting(tx, group, date, request.body.toUserId, now),
      ),
  );

  app.post(
    '/standup-groups/:groupId/days/:date/meeting/end',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'End the standup meeting',
        description: `Finish / End meeting: counts the last turn and stores the total length. Idempotent; a meeting can’t be restarted, but its notes can still be edited and saved. 409 \`MEETING_NOT_STARTED\`. ${TIMING} ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, (tx, group, date, _userId, now) => endMeeting(tx, group, date, now)),
  );

  app.patch(
    '/standup-groups/:groupId/days/:date/meeting',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Autosave meeting notes',
        description: `Plain text, during or after the meeting. They show on the day page only after “Save notes to standup”. 409 \`MEETING_NOT_STARTED\`. ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        body: updateStandupMeetingSchema,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, (tx, group, date, _userId, now) =>
        updateMeetingNotes(tx, group, date, request.body.notes, now),
      ),
  );

  app.post(
    '/standup-groups/:groupId/days/:date/meeting/save-notes',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Save meeting notes to the standup',
        description: `“Save notes to standup”: from now on the day page shows a Meeting notes section with the notes and the tasks created. Send \`notes\` to save the latest text at the same time. Saving again updates it. 409 \`MEETING_NOT_STARTED\`. ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        body: saveStandupMeetingNotesSchema,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, async (tx, group, date, _userId, now) => ({
        row: await saveMeetingNotes(tx, group, date, request.body.notes, now),
        changed: true,
      })),
  );

  app.post(
    '/standup-groups/:groupId/days/:date/meeting/tasks',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Standups'],
        summary: 'Add a task created in the meeting',
        description: `After “Create task” saved a task through \`POST /projects/:id/tasks\`: lists it under “Tasks created” with the item it came from (a blocker or a Today item of a posted update that day). Idempotent. Writes no task activity or references. 400 \`INVALID_TASK\` (not in the workspace), \`INVALID_SOURCE\`; 409 \`MEETING_NOT_STARTED\`. ${DRIVERS} ${MEMBERS}`,
        params: dayParams,
        body: addStandupMeetingTaskSchema,
        response: writeResponses,
      },
    },
    (request) =>
      drive(request, (tx, group, date, userId, now) =>
        addMeetingTask(tx, group, date, userId, request.body, now),
      ),
  );

  done();
};
