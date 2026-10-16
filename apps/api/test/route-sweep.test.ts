import { inviteSchema, notificationPageSchema, subtaskSchema } from '@kite/shared';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiClient, createUser, createWorkspace, errorCode, login, ORIGIN } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

/**
 * Walks every operation in the generated OpenAPI spec, so a new route is covered (or fails here)
 * without anyone remembering to add it: signed out → 401, no Origin → 403, a member of another
 * workspace → 404. Request bodies and required query strings come from the maps below; an
 * operation missing from them fails the sweep.
 */

interface Operation {
  security?: Record<string, unknown>[];
  requestBody?: unknown;
  parameters?: { in: string; name: string; required?: boolean }[];
}
interface Op {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  template: string;
  op: Operation;
}

const PREFIX = '/api/v1';
const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Operations whose denied behaviour isn't "404 for a non-member" (no workspace resource). */
const NOT_WORKSPACE_SCOPED = [
  'GET /health',
  'POST /auth/login',
  'POST /auth/logout',
  'GET /auth/me',
  'PATCH /me',
  'GET /invites/{token}',
  'POST /invites/{token}/accept',
];

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('route sweep: every operation denies anonymous, cross-site and outside callers', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let ops: Op[];
  let outsiderCookie: string;
  let memberCookie: string;
  let params: Record<string, string>;
  let bodies: Record<string, InjectOptions['payload']>;
  let queries: Record<string, string>;

  beforeAll(async () => {
    ctx = await createTestApp({ API_DOCS: true });
    const spec = (await ctx.app.inject({ method: 'GET', url: '/api/docs/json' })).json<{
      paths: Record<string, Record<string, Operation>>;
    }>();
    ops = Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({
        method: method.toUpperCase() as Op['method'],
        template: path.slice(PREFIX.length),
        op,
      })),
    );

    // A workspace with one of everything, owned by someone the outsider can't see.
    const w = await taskWorld(ctx);
    const tag = (
      await w.api('POST', `/workspaces/${w.ws.id}/tags`, { name: 'UX', color: 'violet' })
    ).json<{ id: string }>();
    const task = await w.createTask({ title: 'Secret task' });
    const subtask = subtaskSchema.parse(
      (await w.api('POST', `/tasks/${task.id}/subtasks`, { title: 'Step' })).json(),
    );
    const member = await w.person('member');
    memberCookie = await login(ctx.app, member.user.email);
    const comment = (
      await member.api('POST', `/tasks/${task.id}/comments`, { body: doc('Hi') })
    ).json<{ id: string }>();
    await ctx.app.events.idle();
    const data = new FormData();
    data.append('file', new Blob(['%PDF-1.7 x'], { type: 'application/pdf' }), 'a.pdf');
    const attachment = (await w.api('POST', `/tasks/${task.id}/attachments`, data)).json<{
      id: string;
    }>();
    const invite = inviteSchema.parse(
      (await w.api('POST', `/workspaces/${w.ws.id}/invites`, { email: 'new@kite.test' })).json(),
    );
    const inbox = notificationPageSchema.parse(
      (await w.api('GET', `/me/notifications?workspaceId=${w.ws.id}`)).json(),
    );
    const notification = inbox.items[0];
    if (!notification) throw new Error('expected a notification for the owner');
    const other = await w.newProject('Other');

    const outsider = await createUser(ctx.db);
    await createWorkspace(ctx.db, outsider.id);
    outsiderCookie = await login(ctx.app, outsider.email);

    params = {
      workspaceId: w.ws.id,
      inviteId: invite.id,
      userId: w.owner.id,
      spaceId: w.space.id,
      projectId: w.project.id,
      tagId: tag.id,
      taskRef: task.key,
      taskId: task.id,
      subtaskId: subtask.id,
      commentId: comment.id,
      attachmentId: attachment.id,
      notificationId: notification.id,
      token: 'not-a-real-token',
    };

    const ws = w.ws.id;
    queries = {
      'GET /workspaces/{workspaceId}/project-key-suggestion': 'name=Checkout',
      'GET /workspaces/{workspaceId}/search': 'q=secret',
      'GET /me/notifications': `workspaceId=${ws}`,
      'GET /me/home': `workspaceId=${ws}`,
      'GET /me/activity': `workspaceId=${ws}`,
      'GET /workspaces/{workspaceId}/reports/sprints.csv': `projectId=${w.project.id}`,
    };

    const todo = w.status('todo').id;
    bodies = {
      'POST /auth/login': { email: 'nobody@kite.test', password: 'whatever1' },
      'PATCH /me': { locale: 'en' },
      'POST /workspaces/{workspaceId}/invites': { email: 'x@kite.test' },
      'POST /invites/{token}/accept': { name: 'X', password: 'password123' },
      'PATCH /workspaces/{workspaceId}/members/{userId}': { capacityPoints: 10 },
      'POST /workspaces/{workspaceId}/spaces': { name: 'New', color: 'sky' },
      'PATCH /spaces/{spaceId}': { name: 'Renamed' },
      'POST /spaces/{spaceId}/move': {},
      'POST /workspaces/{workspaceId}/projects': { spaceId: w.space.id, name: 'Another' },
      'PATCH /projects/{projectId}': { color: 'teal' },
      'POST /projects/{projectId}/move': {},
      'POST /workspaces/{workspaceId}/tags': { name: 'New', color: 'blue' },
      'PATCH /tags/{tagId}': { color: 'green' },
      'POST /tags/{tagId}/merge': { intoTagId: tag.id },
      'POST /projects/{projectId}/sprints': {
        name: 'S1',
        startDate: '2026-10-05',
        endDate: '2026-10-16',
      },
      'POST /projects/{projectId}/from-template': { templateId: 'bug-triage' },
      'POST /projects/{projectId}/tasks': { title: 'New' },
      'PATCH /tasks/{taskId}': { title: 'Edited' },
      'POST /tasks/{taskId}/move': { statusId: todo },
      'PUT /tasks/{taskId}/assignees': { userIds: [w.owner.id] },
      'PUT /tasks/{taskId}/tags': { tagIds: [tag.id] },
      'POST /tasks/{taskId}/complete': {},
      'POST /tasks/{taskId}/duplicate': {},
      'POST /tasks/{taskId}/move-to-project': { projectId: other.id },
      'POST /tasks/{taskId}/subtasks': { title: 'Another' },
      'PATCH /subtasks/{subtaskId}': { done: true },
      'POST /subtasks/{subtaskId}/move': {},
      'POST /tasks/{taskId}/comments': { body: doc('Hello') },
      'PATCH /comments/{commentId}': { body: doc('Edited') },
      'POST /tasks/{taskId}/attachments': data,
      'POST /me/notifications/read-all': { workspaceId: ws },
      'PUT /projects/{projectId}/notification-level': { level: 'none' },
      'POST /workspaces/{workspaceId}/members/{userId}/deactivate': {},
      'POST /projects/{projectId}/tasks/batch': { updates: [{ id: task.id, priority: 'low' }] },
      'POST /projects/{projectId}/tasks/batch-delete': { ids: [task.id] },
      'POST /projects/{projectId}/tasks/batch-restore': { ids: [task.id] },
    };
  });

  afterAll(async () => {
    await ctx.close();
  });

  const key = (o: Op) => `${o.method} ${o.template}`;
  /** `security: []` (public) or an empty alternative (session optional, e.g. invite accept). */
  const isPublic = (o: Op) =>
    o.op.security !== undefined &&
    (o.op.security.length === 0 || o.op.security.some((s) => Object.keys(s).length === 0));

  function request(o: Op, headers: Record<string, string>): InjectOptions {
    const path = o.template.replace(/\{(\w+)\}/g, (_, name: string) => {
      const value = params[name];
      if (!value) throw new Error(`${key(o)}: no fixture for path param "${name}"`);
      return value;
    });
    const query = queries[key(o)];
    const body = bodies[key(o)];
    return {
      method: o.method,
      url: `${PREFIX}${path}${query ? `?${query}` : ''}`,
      headers,
      ...(body === undefined ? {} : { payload: body }),
    };
  }

  it('has a body and query fixture for every operation that needs one', () => {
    expect(ops.length).toBeGreaterThan(80);
    for (const o of ops) {
      if (o.op.requestBody)
        expect(bodies, `${key(o)} needs a body fixture`).toHaveProperty([key(o)]);
      const required = (o.op.parameters ?? []).filter((p) => p.in === 'query' && p.required);
      if (required.length > 0) {
        expect(queries, `${key(o)} needs a query fixture`).toHaveProperty([key(o)]);
      }
    }
  });

  it('answers 401 to a signed-out caller on every non-public operation', async () => {
    const guarded = ops.filter((o) => !isPublic(o) && key(o) !== 'POST /auth/logout');
    for (const o of guarded) {
      const res = await ctx.app.inject(
        request(o, MUTATIONS.has(o.method) ? { origin: ORIGIN } : {}),
      );
      expect(res.statusCode, `${key(o)}: ${res.body}`).toBe(401);
    }
  });

  it('rejects every mutation without the web Origin, before anything else runs', async () => {
    for (const o of ops.filter((x) => MUTATIONS.has(x.method))) {
      for (const origin of [undefined, 'https://evil.example']) {
        const res = await ctx.app.inject(
          request(o, { cookie: memberCookie, ...(origin ? { origin } : {}) }),
        );
        expect(res.statusCode, `${key(o)} origin=${origin}`).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
    }
  });

  it('answers 404 to a member of another workspace, never confirming the resource', async () => {
    const scoped = ops.filter((o) => !NOT_WORKSPACE_SCOPED.includes(key(o)));
    for (const o of scoped) {
      const res = await ctx.app.inject(
        request(o, {
          cookie: outsiderCookie,
          ...(MUTATIONS.has(o.method) ? { origin: ORIGIN } : {}),
        }),
      );
      expect(res.statusCode, `${key(o)}: ${res.body}`).toBe(404);
      expect(errorCode(res), key(o)).toBe('NOT_FOUND');
    }
  });

  it('left the workspace untouched', async () => {
    const api = apiClient(ctx.app, memberCookie);
    const res = await api('GET', `/tasks/${params.taskId}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ title: 'Secret task', deletedAt: null });
  });
});
