import {
  apiErrorSchema,
  overviewReportQuerySchema,
  overviewReportSchema,
  personReportQuerySchema,
  personReportSchema,
  reportQuerySchema,
  sprintsExportQuerySchema,
  sprintsReportQuerySchema,
  sprintsReportSchema,
  workloadReportQuerySchema,
  workloadReportSchema,
} from '@kite/shared';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { roleAtLeast } from '../auth/access.js';
import { httpError } from '../errors.js';
import { overviewExport, personExport, sprintsExport, workloadExport } from '../reports/exports.js';
import { buildOverview } from '../reports/overview.js';
import { buildPerson } from '../reports/people.js';
import { resolveReportScope, type ReportContext } from '../reports/scope.js';
import { buildSprints } from '../reports/sprints.js';
import { buildWorkload } from '../reports/workload.js';

const err = apiErrorSchema;
const params = z.object({ workspaceId: z.uuid() });
const personParams = params.extend({
  /** A member's id, or `me`. */
  userId: z.union([z.literal('me'), z.uuid()]),
});
const csvResponse = z.string().describe('UTF-8 CSV with a byte-order mark');
const errors = { 400: err, 401: err, 404: err };

const MEMBERS = 'Any workspace member; non-members get 404.';
const PERSON_ACCESS =
  'Admins and the owner can read anyone; a member only themselves (`me` or their own id), else 403 `FORBIDDEN`. 404 when the person is not a member of the workspace.';
const CSV_NOTE = 'Headers follow the caller’s language (mn/en).';

/** Cache key part shared by every report: whatever besides the query changes the numbers. */
const contextKey = (ctx: ReportContext) => `${ctx.timezone}|${ctx.today}`;

function sendCsv(reply: FastifyReply, filename: string, body: string) {
  return reply
    .header('content-type', 'text/csv; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .header('cache-control', 'private, no-cache')
    .send(body);
}

/** `me` → the caller; members may only read themselves. */
function personId(ctx: ReportContext, userId: string): string {
  const id = userId === 'me' ? ctx.user.id : userId;
  if (id !== ctx.user.id && !roleAtLeast(ctx.role, 'admin')) {
    throw httpError(403, 'FORBIDDEN', 'Only admins can see other people’s reports');
  }
  return id;
}

export const reportRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const base = '/workspaces/:workspaceId/reports';

  app.get(
    `${base}/overview`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Overview',
        description: `Completed, cycle time, on-time delivery (each vs the previous period), overdue now, 12-week throughput, where work waits and aging tasks, for the workspace, a space or a project. Dates in the caller’s time zone. Returns the 20 longest-waiting open tasks unless \`agingLimit\` asks for more (\`all\` = every open task). Cached up to 5 minutes (\`generatedAt\`). ${MEMBERS}`,
        params,
        querystring: overviewReportQuerySchema,
        response: { 200: overviewReportSchema, ...errors },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      const ctx = await resolveReportScope(request, workspaceId, request.query);
      const { value, generatedAt } = await app.reportCache.get(
        workspaceId,
        `overview|${JSON.stringify(request.query)}|${contextKey(ctx)}`,
        () => buildOverview(app.db, ctx, request.query),
      );
      return { ...value, generatedAt: generatedAt.toISOString() };
    },
  );

  app.get(
    `${base}/overview.csv`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Overview as CSV',
        description: `Every open task in the scope with its days in status (the Aging table). ${CSV_NOTE} ${MEMBERS}`,
        params,
        querystring: reportQuerySchema,
        response: { 200: csvResponse, ...errors },
      },
    },
    async (request, reply) => {
      const ctx = await resolveReportScope(request, request.params.workspaceId, request.query);
      return sendCsv(reply, 'aging.csv', await overviewExport(app.db, ctx, ctx.user.locale));
    },
  );

  app.get(
    `${base}/sprints`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Sprints',
        description: `Sprints covering a project in scope (\`spaceId\`, \`projectId\`, else the workspace) and the selected one (default: current, else the latest started, else the newest), counting only tasks of the projects in scope: working days without weekends and workspace holidays, committed / added / completed, carried over, burndown, the status open tasks wait longest in, and the last 6 related sprints (sharing a project in scope). 404 for a sprint covering no project in scope. ${MEMBERS}`,
        params,
        querystring: sprintsReportQuerySchema,
        response: { 200: sprintsReportSchema, ...errors },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      const { projectId, spaceId, sprintId } = request.query;
      const ctx = await resolveReportScope(request, workspaceId, { projectId, spaceId });
      const { value, generatedAt } = await app.reportCache.get(
        workspaceId,
        `sprints|${ctx.projectId ?? ''}|${ctx.spaceId ?? ''}|${sprintId ?? ''}|${contextKey(ctx)}`,
        () => buildSprints(app.db, ctx, sprintId),
      );
      return { ...value, generatedAt: generatedAt.toISOString() };
    },
  );

  app.get(
    `${base}/sprints.csv`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Sprints as CSV',
        description: `The selected sprint’s tasks in scope: committed, added mid-sprint, done, times carried. ${CSV_NOTE} ${MEMBERS}`,
        params,
        querystring: sprintsExportQuerySchema,
        response: { 200: csvResponse, ...errors },
      },
    },
    async (request, reply) => {
      const { projectId, spaceId, sprintId } = request.query;
      const ctx = await resolveReportScope(request, request.params.workspaceId, {
        projectId,
        spaceId,
      });
      const csv = await sprintsExport(app.db, ctx, ctx.user.locale, sprintId);
      return sendCsv(reply, 'sprint.csv', csv);
    },
  );

  app.get(
    `${base}/workload`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Workload',
        description: `Open tasks and points per person, split by due date (overdue / this week / later / none), with capacity and Heavy / Balanced / Light. Lists workspace members, or with a scope filter the scoped projects’ members and anyone with open tasks there. ${MEMBERS}`,
        params,
        querystring: workloadReportQuerySchema,
        response: { 200: workloadReportSchema, ...errors },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      const ctx = await resolveReportScope(request, workspaceId, request.query);
      const { value, generatedAt } = await app.reportCache.get(
        workspaceId,
        `workload|${JSON.stringify(request.query)}|${contextKey(ctx)}`,
        () => buildWorkload(app.db, ctx),
      );
      return { ...value, generatedAt: generatedAt.toISOString() };
    },
  );

  app.get(
    `${base}/workload.csv`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · Workload as CSV',
        description: `One row per person. ${CSV_NOTE} ${MEMBERS}`,
        params,
        querystring: workloadReportQuerySchema,
        response: { 200: csvResponse, ...errors },
      },
    },
    async (request, reply) => {
      const ctx = await resolveReportScope(request, request.params.workspaceId, request.query);
      return sendCsv(reply, 'workload.csv', await workloadExport(app.db, ctx, ctx.user.locale));
    },
  );

  app.get(
    `${base}/people/:userId`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · People / My performance',
        description: `One person’s completed work, on-time, cycle time, overdue, review turnaround, 12-week trends with team medians, helping others and open tasks. ${PERSON_ACCESS}`,
        params: personParams,
        querystring: personReportQuerySchema,
        response: { 200: personReportSchema, 403: err, ...errors },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      const ctx = await resolveReportScope(request, workspaceId);
      const userId = personId(ctx, request.params.userId);
      const { value, generatedAt } = await app.reportCache.get(
        workspaceId,
        `person|${userId}|${JSON.stringify(request.query)}|${contextKey(ctx)}`,
        () => buildPerson(app.db, ctx, userId, request.query),
      );
      return { ...value, generatedAt: generatedAt.toISOString() };
    },
  );

  app.get(
    `${base}/people/:userId.csv`,
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Reports'],
        summary: 'Reports · People as CSV ("Export my data")',
        description: `The person’s completed tasks in the period with cycle times. ${CSV_NOTE} ${PERSON_ACCESS}`,
        params: personParams,
        querystring: personReportQuerySchema,
        response: { 200: csvResponse, 403: err, ...errors },
      },
    },
    async (request, reply) => {
      const ctx = await resolveReportScope(request, request.params.workspaceId);
      const userId = personId(ctx, request.params.userId);
      const csv = await personExport(app.db, ctx, ctx.user.locale, userId, request.query);
      return sendCsv(reply, 'completed.csv', csv);
    },
  );

  done();
};
