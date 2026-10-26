import websocket from '@fastify/websocket';
import { REALTIME_CLOSE_UNAUTHORIZED } from '@kite/shared';
import { and, gt, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { sessions, workspaceMembers } from '../db/schema/index.js';
import { LocalBroadcaster, type Broadcaster } from './broadcaster.js';
import { RealtimeHub } from './hub.js';
import { toRealtime } from './messages.js';
import { activeMember } from '../auth/membership.js';
import { SESSION_MAX_AGE_MS } from '../auth/sessions.js';

/** Ping every socket this often; one that missed the previous ping is dropped. */
const HEARTBEAT_MS = 25_000;
/** Re-check sessions and memberships this often (sign-out elsewhere, removal, expiry). */
const REVALIDATE_MS = 5 * 60_000;

declare module 'fastify' {
  interface FastifyInstance {
    realtime: { broadcaster: Broadcaster; hub: RealtimeHub };
  }
}

/**
 * WebSocket support, the hub of this instance's sockets, and the bridge from the event bus:
 * every committed task change goes to the workspace's subscribers (except the tab that made it).
 */
export async function registerRealtime(app: FastifyInstance): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 4096 } });

  const broadcaster = new LocalBroadcaster();
  const hub = new RealtimeHub(broadcaster, app.log);
  app.decorate('realtime', { broadcaster, hub });

  app.events.on('*', (event) => {
    const message = toRealtime(event);
    if (!message) return;
    broadcaster.publish({
      to: { workspaceId: event.workspaceId },
      exceptClientId: event.clientId,
      message,
    });
  });

  const heartbeat = setInterval(() => {
    for (const conn of hub.connections) {
      if (!conn.alive) {
        conn.socket.terminate();
        continue;
      }
      conn.alive = false;
      conn.socket.ping();
      hub.send(conn, { type: 'heartbeat' });
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const revalidation = setInterval(() => {
    revalidate(app).catch((err: unknown) => {
      app.log.error({ err }, 'Realtime revalidation failed');
    });
  }, REVALIDATE_MS);
  revalidation.unref();

  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    clearInterval(revalidation);
    hub.close();
    await broadcaster.close();
  });
}

/** Closes sockets whose session ended or whose user left the workspace they subscribed to. */
export async function revalidate(app: FastifyInstance): Promise<void> {
  const conns = [...app.realtime.hub.connections];
  if (conns.length === 0) return;
  const now = new Date();
  const live = await app.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(
      and(
        inArray(sessions.id, [...new Set(conns.map((c) => c.sessionId))]),
        gt(sessions.expiresAt, now),
        gt(sessions.createdAt, new Date(now.getTime() - SESSION_MAX_AGE_MS)),
      ),
    );
  const members = await app.db
    .select({ workspaceId: workspaceMembers.workspaceId, userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(
      and(inArray(workspaceMembers.userId, [...new Set(conns.map((c) => c.userId))]), activeMember),
    );

  const liveSessions = new Set(live.map((s) => s.id));
  const memberships = new Set(members.map((m) => `${m.workspaceId}:${m.userId}`));
  for (const conn of conns) {
    const member = !conn.workspaceId || memberships.has(`${conn.workspaceId}:${conn.userId}`);
    if (!liveSessions.has(conn.sessionId) || !member) {
      conn.socket.close(REALTIME_CLOSE_UNAUTHORIZED);
    }
  }
}
