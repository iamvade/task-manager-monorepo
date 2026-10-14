import {
  REALTIME_CLOSE_POLICY,
  apiErrorSchema,
  realtimeClientIdSchema,
  realtimeClientMessageSchema,
  type RealtimeClientMessage,
} from '@kite/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/plugin.js';
import { projects, tasks, workspaceMembers } from '../db/schema/index.js';
import { errorBody } from '../errors.js';
import type { Connection } from '../realtime/hub.js';
import { activeMember } from '../auth/membership.js';

/** More client messages than this in one window closes the socket (1008). */
const MESSAGE_BUDGET = 50;
const BUDGET_WINDOW_MS = 10_000;

const description = `
WebSocket (upgrade this GET). Authenticated by the session cookie; \`Origin\` must be the web origin
(403 \`CSRF_REJECTED\` otherwise). Pass \`?client=<tab id>\` (the same id the tab sends as
\`X-Kite-Client\` on its requests) so the tab's own changes aren't echoed back.

Client messages (JSON): \`{"type":"subscribe","workspaceId"}\` (one workspace per socket; answered
with \`ready\`: who is online and viewing what, or \`error\` \`NOT_FOUND\` for a workspace you aren't
a member of) and \`{"type":"view","taskId"}\` (the task this tab shows, \`null\` for none).

Server messages: \`task.created\`/\`task.updated\`/\`task.moved\`/\`task.deleted\`,
\`comment.created\`/\`comment.changed\`, \`subtask.changed\` (ids plus minimal changed data;
refetch the rest), \`notification.created\` (recipient only), \`presence.online\`/\`offline\`,
\`presence.viewers\`, \`heartbeat\` (every 25 s). See \`realtimeServerMessageSchema\` in
\`packages/shared\`. Close code 4401: session or membership ended.
`.trim();

export const realtimeRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const webOrigin = new URL(app.config.WEB_ORIGIN).origin;

  app.get(
    '/ws',
    {
      websocket: true,
      // A GET skips the CSRF hook, and browsers send cookies on cross-site WebSocket upgrades.
      onRequest: async (request, reply) => {
        if (request.headers.origin !== webOrigin) {
          return reply.code(403).send(errorBody('CSRF_REJECTED', 'Request origin not allowed'));
        }
      },
      preHandler: app.authenticate,
      schema: {
        tags: ['Realtime'],
        summary: 'Realtime updates and presence',
        description,
        querystring: z.object({ client: realtimeClientIdSchema.optional() }),
        response: { 400: apiErrorSchema, 401: apiErrorSchema, 403: apiErrorSchema },
      },
    },
    (socket, request) => {
      const { user, sessionId } = requireAuth(request);
      const { hub } = app.realtime;
      const conn = hub.add(socket, { userId: user.id, sessionId, clientId: request.query.client });

      // Handled one at a time, so a `view` right after `subscribe` sees the subscription.
      let queue = Promise.resolve();
      let budget = { count: 0, since: Date.now() };

      socket.on('message', (data, isBinary) => {
        const now = Date.now();
        if (now - budget.since > BUDGET_WINDOW_MS) budget = { count: 0, since: now };
        if (++budget.count > MESSAGE_BUDGET) {
          socket.close(REALTIME_CLOSE_POLICY);
          return;
        }
        const message = !isBinary && Buffer.isBuffer(data) ? parse(data.toString('utf8')) : null;
        if (!message) return;
        queue = queue
          .then(() => handle(conn, message))
          .catch((err: unknown) => {
            request.log.error({ err }, 'Realtime message failed');
          });
      });
      socket.on('pong', () => {
        conn.alive = true;
      });
      socket.on('close', () => {
        hub.remove(conn);
      });
    },
  );

  async function handle(conn: Connection, message: RealtimeClientMessage): Promise<void> {
    const { hub } = app.realtime;
    if (message.type === 'subscribe') {
      const [member] = await app.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, message.workspaceId),
            eq(workspaceMembers.userId, conn.userId),
            activeMember,
          ),
        )
        .limit(1);
      if (member) hub.subscribe(conn, message.workspaceId);
      else hub.send(conn, { type: 'error', code: 'NOT_FOUND' });
      return;
    }

    if (!message.taskId || !conn.workspaceId) {
      hub.view(conn, null);
      return;
    }
    // Only a live task of the subscribed workspace counts as viewed.
    const [task] = await app.db
      .select({ id: tasks.id })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(
        and(
          eq(tasks.id, message.taskId),
          eq(projects.workspaceId, conn.workspaceId),
          isNull(tasks.deletedAt),
        ),
      )
      .limit(1);
    hub.view(conn, task ? task.id : null);
  }

  done();
};

function parse(text: string): RealtimeClientMessage | null {
  try {
    const parsed = realtimeClientMessageSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
