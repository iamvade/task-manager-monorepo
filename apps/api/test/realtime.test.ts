import {
  REALTIME_CLIENT_HEADER,
  commentSchema,
  subtaskSchema,
  taskListItemSchema,
  realtimeServerMessageSchema,
  type RealtimeClientMessage,
  type RealtimeServerMessage,
  type RichTextNode,
} from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { toRealtime } from '../src/realtime/messages.js';
import { ORIGIN, createUser, createWorkspace, login } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

type Message = RealtimeServerMessage;
type Of<T extends Message['type']> = Extract<Message, { type: T }>;

/** How long "nothing arrives" assertions wait after the bus went idle. */
const QUIET_MS = 150;

describe('realtime', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let base: string;
  const sockets: WebSocket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    const address = await ctx.app.listen({ port: 0, host: '127.0.0.1' });
    base = address.replace(/^http/, 'ws');
  });

  afterAll(async () => {
    for (const s of sockets) s.terminate();
    await ctx.close();
  });

  /** Opens a socket; resolves on open or rejects with the HTTP status of a refused upgrade. */
  function open(cookie: string | null, opts: { client?: string; origin?: string | null } = {}) {
    const headers: Record<string, string> = {};
    if (cookie) headers.cookie = cookie;
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers.origin = origin;
    const query = opts.client ? `?client=${opts.client}` : '';
    const socket = new WebSocket(`${base}/api/v1/ws${query}`, { headers });
    sockets.push(socket);
    const received: Message[] = [];
    const waiters = new Set<() => void>();
    socket.on('message', (data) => {
      received.push(
        realtimeServerMessageSchema.parse(
          JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : ''),
        ),
      );
      for (const w of waiters) w();
    });

    const client = {
      socket,
      received,
      send: (message: RealtimeClientMessage) => {
        socket.send(JSON.stringify(message));
      },
      /** The first message (seen so far or arriving) of `type` matching `match`. */
      next: <T extends Message['type']>(type: T, match: (m: Of<T>) => boolean = () => true) =>
        new Promise<Of<T>>((resolve, reject) => {
          const check = () => {
            const hit = received.find((m): m is Of<T> => m.type === type && match(m as Of<T>));
            if (!hit) return;
            waiters.delete(check);
            clearTimeout(timer);
            resolve(hit);
          };
          const timer = setTimeout(() => {
            waiters.delete(check);
            reject(new Error(`no ${type}; got ${received.map((m) => m.type).join(', ')}`));
          }, 2000);
          waiters.add(check);
          check();
        }),
      types: () => received.map((m) => m.type),
      closed: new Promise<number>((resolve) =>
        socket.on('close', (code) => {
          resolve(code);
        }),
      ),
    };
    return new Promise<typeof client>((resolve, reject) => {
      socket.on('open', () => {
        resolve(client);
      });
      socket.on('unexpected-response', (_req, res) => {
        reject(new Error(`HTTP ${res.statusCode}`));
      });
      socket.on('error', reject);
    });
  }

  async function subscribed(cookie: string, workspaceId: string, client?: string) {
    const c = await open(cookie, { client });
    c.send({ type: 'subscribe', workspaceId });
    await c.next('ready');
    return c;
  }

  async function quiet() {
    await ctx.app.events.idle();
    await new Promise((r) => setTimeout(r, QUIET_MS));
  }

  async function world() {
    const w = await taskWorld(ctx);
    const ownerCookie = await login(ctx.app, w.owner.email);
    const sara = await w.person('member', 'Sara Khan');
    const saraCookie = await login(ctx.app, sara.user.email);
    return { ...w, ownerCookie, sara, saraCookie };
  }

  it('refuses upgrades without a session or from another origin', async () => {
    const w = await world();
    await expect(open(null)).rejects.toThrow('HTTP 401');
    await expect(open(w.ownerCookie, { origin: 'https://evil.example' })).rejects.toThrow(
      'HTTP 403',
    );
    await expect(open(w.ownerCookie, { origin: null })).rejects.toThrow('HTTP 403');
  });

  it('only subscribes members, and outsiders get no events', async () => {
    const w = await world();
    const outsider = await createUser(ctx.db, { name: 'Out Sider' });
    await createWorkspace(ctx.db, outsider.id);
    const c = await open(await login(ctx.app, outsider.email));
    c.send({ type: 'subscribe', workspaceId: w.ws.id });
    expect((await c.next('error')).code).toBe('NOT_FOUND');

    await w.createTask({ title: 'Secret' });
    await quiet();
    expect(c.types()).toEqual(['error']);
  });

  it('broadcasts task, comment and subtask changes with the actor and minimal data', async () => {
    const w = await world();
    const sara = await subscribed(w.saraCookie, w.ws.id);

    const task = await w.createTask({ title: 'Live' });
    const created = await sara.next('task.created', (m) => m.taskId === task.id);
    expect(created).toMatchObject({
      workspaceId: w.ws.id,
      projectId: w.project.id,
      actorId: w.owner.id,
    });

    const done = w.status('done');
    const moved = await w.api('POST', `/tasks/${task.id}/move`, { statusId: done.id });
    expect(moved.statusCode, moved.body).toBe(200);
    const msg = await sara.next('task.moved', (m) => m.taskId === task.id);
    expect(msg.statusId).toBe(done.id);
    expect(msg.position).toBe(taskListItemSchema.parse(moved.json()).position);

    await w.api('PATCH', `/tasks/${task.id}`, { priority: 'high' });
    expect((await sara.next('task.updated', (m) => m.taskId === task.id)).changes).toContain(
      'priority.changed',
    );

    const body: RichTextNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    };
    const comment = await w.api('POST', `/tasks/${task.id}/comments`, { body });
    expect(comment.statusCode, comment.body).toBe(201);
    const commentId = commentSchema.parse(comment.json()).id;
    expect((await sara.next('comment.created')).commentId).toBe(commentId);
    await w.api('DELETE', `/comments/${commentId}`);
    expect((await sara.next('comment.changed')).commentId).toBe(commentId);

    const sub = await w.api('POST', `/tasks/${task.id}/subtasks`, { title: 'Step' });
    expect(sub.statusCode, sub.body).toBe(201);
    expect((await sara.next('subtask.changed')).subtaskId).toBe(subtaskSchema.parse(sub.json()).id);

    await w.api('DELETE', `/tasks/${task.id}`);
    await sara.next('task.deleted', (m) => m.taskId === task.id);
    await w.api('POST', `/tasks/${task.id}/restore`);
    expect((await sara.next('task.created', (m) => m.restored === true)).taskId).toBe(task.id);
  });

  it("skips the tab that made the change but reaches the user's other tabs", async () => {
    const w = await world();
    const tab = 'tab-aaaaaaaa';
    const own = await subscribed(w.ownerCookie, w.ws.id, tab);
    const other = await subscribed(w.ownerCookie, w.ws.id, 'tab-bbbbbbbb');

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/v1/projects/${w.project.id}/tasks`,
      headers: { cookie: w.ownerCookie, origin: ORIGIN, [REALTIME_CLIENT_HEADER]: tab },
      payload: { title: 'Mine' },
    });
    expect(res.statusCode, res.body).toBe(201);
    await other.next('task.created');
    await quiet();
    expect(own.types()).not.toContain('task.created');
  });

  it('pushes notification.created to the recipient only', async () => {
    const w = await world();
    const owner = await subscribed(w.ownerCookie, w.ws.id);
    const sara = await subscribed(w.saraCookie, w.ws.id);
    const task = await w.createTask({ title: 'Mention' });
    const body: RichTextNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'mention', attrs: { id: w.sara.user.id, label: 'Sara' } }],
        },
      ],
    };
    await w.api('POST', `/tasks/${task.id}/comments`, { body });
    const n = await sara.next('notification.created');
    expect(n).toMatchObject({ taskId: task.id, actorId: w.owner.id, notificationType: 'mention' });
    await quiet();
    expect(owner.types()).not.toContain('notification.created');
  });

  it('tracks who is online, across tabs', async () => {
    const w = await world();
    const owner = await subscribed(w.ownerCookie, w.ws.id);
    const tab1 = await subscribed(w.saraCookie, w.ws.id);
    expect((await tab1.next('ready')).online.sort()).toEqual([w.owner.id, w.sara.user.id].sort());
    await owner.next('presence.online', (m) => m.userId === w.sara.user.id);

    const tab2 = await subscribed(w.saraCookie, w.ws.id);
    tab1.socket.close();
    await tab1.closed;
    await quiet();
    expect(owner.received.filter((m) => m.type === 'presence.offline')).toEqual([]);

    tab2.socket.close();
    await owner.next('presence.offline', (m) => m.userId === w.sara.user.id);
  });

  it('shares task viewers and forgets them on close', async () => {
    const w = await world();
    const task = await w.createTask({ title: 'Viewed' });
    const owner = await subscribed(w.ownerCookie, w.ws.id);
    const sara = await subscribed(w.saraCookie, w.ws.id);

    sara.send({ type: 'view', taskId: task.id });
    const viewers = await owner.next('presence.viewers', (m) => m.userIds.length === 1);
    expect(viewers).toMatchObject({ taskId: task.id, userIds: [w.sara.user.id] });

    // A late subscriber sees the viewer in its snapshot.
    const late = await subscribed(w.ownerCookie, w.ws.id);
    expect((await late.next('ready')).viewers).toEqual({ [task.id]: [w.sara.user.id] });

    sara.socket.close();
    await owner.next('presence.viewers', (m) => m.taskId === task.id && m.userIds.length === 0);
  });

  it('ignores views of tasks outside the subscribed workspace', async () => {
    const w = await world();
    const other = await taskWorld(ctx, 'Other Owner');
    const foreign = await other.createTask({ title: 'Elsewhere' });
    const owner = await subscribed(w.ownerCookie, w.ws.id);
    const sara = await subscribed(w.saraCookie, w.ws.id);
    sara.send({ type: 'view', taskId: foreign.id });
    await quiet();
    expect(owner.types()).not.toContain('presence.viewers');
  });

  it('closes the sockets of a session on sign-out', async () => {
    const w = await world();
    const sara = await subscribed(w.saraCookie, w.ws.id);
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { cookie: w.saraCookie, origin: ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(await sara.closed).toBe(4401);
  });
});

describe('toRealtime', () => {
  const base = {
    workspaceId: '019a0000-0000-7000-8000-000000000001',
    projectId: '019a0000-0000-7000-8000-000000000002',
    taskId: '019a0000-0000-7000-8000-000000000003',
    actorId: '019a0000-0000-7000-8000-000000000004',
    at: new Date('2026-10-08T00:00:00Z'),
  };

  it('reads a move to another project from its project.changed row', () => {
    const from = '019a0000-0000-7000-8000-000000000009';
    const message = toRealtime({
      ...base,
      type: 'task.updated',
      activities: [
        {
          id: 'a',
          type: 'project.changed',
          payload: {
            from: { projectId: from, name: 'Old', key: 'OLD-1' },
            to: { projectId: base.projectId, name: 'New', key: 'NEW-1' },
          },
        },
      ],
    });
    expect(message).toMatchObject({
      type: 'task.updated',
      changes: ['project.changed'],
      fromProjectId: from,
    });
  });

  it('folds attachments into updates and a move without position into an update', () => {
    expect(toRealtime({ ...base, type: 'attachment.changed', activities: [] })?.type).toBe(
      'task.updated',
    );
    expect(toRealtime({ ...base, type: 'task.moved', activities: [] })?.type).toBe('task.updated');
  });
});
