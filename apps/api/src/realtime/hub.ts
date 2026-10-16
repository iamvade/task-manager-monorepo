import type { RealtimeServerMessage } from '@kite/shared';
import type { FastifyBaseLogger } from 'fastify';
import { uuidv7 } from 'uuidv7';
import type { WebSocket } from 'ws';
import type { Broadcaster, Envelope } from './broadcaster.js';

/** A socket that can't keep up (this much unsent) is dropped; it refetches on reconnect. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

export interface Connection {
  readonly id: string;
  readonly socket: WebSocket;
  readonly userId: string;
  readonly sessionId: string;
  /** The browser tab (`?client=`), so its own changes aren't echoed back. */
  readonly clientId: string | undefined;
  workspaceId: string | null;
  /** The task this tab shows. */
  viewing: string | null;
  /** Answered the last ping. */
  alive: boolean;
}

/**
 * This instance's sockets and the presence they make up, all in memory: a user is online in a
 * workspace while they have a subscribed connection there, and views whatever task any of their
 * tabs shows. Presence changes go through the broadcaster like any other message.
 */
export class RealtimeHub {
  readonly #connections = new Set<Connection>();
  readonly #byWorkspace = new Map<string, Set<Connection>>();
  readonly #unsubscribe: () => void;

  constructor(
    private readonly broadcaster: Broadcaster,
    private readonly log: FastifyBaseLogger,
  ) {
    this.#unsubscribe = broadcaster.subscribe((envelope) => {
      this.#deliver(envelope);
    });
  }

  get connections(): ReadonlySet<Connection> {
    return this.#connections;
  }

  add(
    socket: WebSocket,
    who: { userId: string; sessionId: string; clientId: string | undefined },
  ): Connection {
    const conn: Connection = {
      id: uuidv7(),
      socket,
      ...who,
      workspaceId: null,
      viewing: null,
      alive: true,
    };
    this.#connections.add(conn);
    return conn;
  }

  /** Forgets a closed socket: leaves its workspace (presence) and the task it viewed. */
  remove(conn: Connection): void {
    if (!this.#connections.delete(conn)) return;
    this.#leave(conn);
  }

  /** Joins `workspaceId` (leaving the previous one) and answers with the presence snapshot. */
  subscribe(conn: Connection, workspaceId: string): void {
    if (!this.#connections.has(conn)) return;
    if (conn.workspaceId !== workspaceId) {
      this.#leave(conn);
      const wasOnline = this.#isOnline(workspaceId, conn.userId);
      let set = this.#byWorkspace.get(workspaceId);
      if (!set) this.#byWorkspace.set(workspaceId, (set = new Set()));
      set.add(conn);
      conn.workspaceId = workspaceId;
      if (!wasOnline) {
        this.#publishTo(workspaceId, { type: 'presence.online', workspaceId, userId: conn.userId });
      }
    }
    this.send(conn, {
      type: 'ready',
      workspaceId,
      online: this.online(workspaceId),
      viewers: this.viewers(workspaceId),
    });
  }

  /** Sets the task the connection shows (already checked to be in its workspace). */
  view(conn: Connection, taskId: string | null): void {
    if (this.#connections.has(conn)) this.#setViewing(conn, taskId);
  }

  online(workspaceId: string): string[] {
    return [...new Set([...(this.#byWorkspace.get(workspaceId) ?? [])].map((c) => c.userId))];
  }

  viewers(workspaceId: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const conn of this.#byWorkspace.get(workspaceId) ?? []) {
      if (!conn.viewing) continue;
      const list = (result[conn.viewing] ??= []);
      if (!list.includes(conn.userId)) list.push(conn.userId);
    }
    return result;
  }

  send(conn: Connection, message: RealtimeServerMessage): void {
    const { socket } = conn;
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > MAX_BUFFERED_BYTES) {
      this.log.warn({ userId: conn.userId }, 'Realtime: dropping slow connection');
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(message));
  }

  /** Closes every socket of a session (sign-out, expiry). */
  closeSession(sessionId: string, code: number): void {
    for (const conn of this.#connections) {
      if (conn.sessionId === sessionId) conn.socket.close(code);
    }
  }

  close(): void {
    this.#unsubscribe();
    for (const conn of this.#connections) conn.socket.terminate();
    this.#connections.clear();
    this.#byWorkspace.clear();
  }

  #deliver({ to, exceptClientId, message }: Envelope): void {
    const only = 'userIds' in to ? new Set(to.userIds) : null;
    for (const conn of this.#byWorkspace.get(to.workspaceId) ?? []) {
      if ('userId' in to && conn.userId !== to.userId) continue;
      if (only && !only.has(conn.userId)) continue;
      if (exceptClientId && conn.clientId === exceptClientId) continue;
      this.send(conn, message);
    }
  }

  #leave(conn: Connection): void {
    const workspaceId = conn.workspaceId;
    if (!workspaceId) return;
    this.#setViewing(conn, null);
    const set = this.#byWorkspace.get(workspaceId);
    set?.delete(conn);
    if (set?.size === 0) this.#byWorkspace.delete(workspaceId);
    conn.workspaceId = null;
    if (!this.#isOnline(workspaceId, conn.userId)) {
      this.#publishTo(workspaceId, { type: 'presence.offline', workspaceId, userId: conn.userId });
    }
  }

  #setViewing(conn: Connection, taskId: string | null): void {
    const workspaceId = conn.workspaceId;
    if (!workspaceId || conn.viewing === taskId) return;
    const changed = [conn.viewing, taskId].filter((id): id is string => id !== null);
    const before = changed.map((id) => this.#viewersOf(workspaceId, id));
    conn.viewing = taskId;
    changed.forEach((id, i) => {
      this.#publishViewers(workspaceId, id, before[i] ?? []);
    });
  }

  #isOnline(workspaceId: string, userId: string): boolean {
    for (const conn of this.#byWorkspace.get(workspaceId) ?? []) {
      if (conn.userId === userId) return true;
    }
    return false;
  }

  #viewersOf(workspaceId: string, taskId: string): string[] {
    return this.viewers(workspaceId)[taskId] ?? [];
  }

  #publishViewers(workspaceId: string, taskId: string, before: string[]): void {
    const userIds = this.#viewersOf(workspaceId, taskId);
    if (userIds.length === before.length && userIds.every((id) => before.includes(id))) return;
    this.#publishTo(workspaceId, { type: 'presence.viewers', workspaceId, taskId, userIds });
  }

  #publishTo(workspaceId: string, message: RealtimeServerMessage): void {
    this.broadcaster.publish({ to: { workspaceId }, message });
  }
}
