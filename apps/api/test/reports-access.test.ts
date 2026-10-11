import { overviewReportSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSpace, createUser, createWorkspace, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { timelineTask } from './report-fixtures.js';
import { taskWorld } from './task-setup.js';

const NOW = new Date('2026-10-14T04:00:00Z');

describe('Reports access', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let fx: Awaited<ReturnType<typeof world>>;

  beforeAll(async () => {
    ctx = await createTestApp({}, { now: () => NOW });
    fx = await world();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const member = await w.person('member', 'Member M.');
    const admin = await w.person('admin', 'Admin A.');
    const outsider = await w.person(null, 'Outsider O.');
    const foreignOwner = await createUser(ctx.db);
    const foreignWs = await createWorkspace(ctx.db, foreignOwner.id);
    const foreignSpace = await createSpace(ctx.db, foreignWs.id);
    await timelineTask(ctx.db, {
      projectId: w.project.id,
      createdBy: w.owner.id,
      assigneeIds: [member.user.id],
      timeline: [['todo', '2026-10-01T00:00:00Z']],
    });
    return { w, member, admin, outsider, foreignOwner, foreignSpace };
  }

  const url = (path: string) => `/workspaces/${fx.w.ws.id}/reports/${path}`;

  it('any member can read Overview, Sprints and Workload, and their own report', async () => {
    const api = fx.member.api;
    for (const path of [
      'overview',
      'overview.csv',
      `sprints?projectId=${fx.w.project.id}`,
      `sprints.csv?projectId=${fx.w.project.id}`,
      'workload',
      'workload.csv',
      'people/me',
      'people/me.csv',
      `people/${fx.member.user.id}`,
    ]) {
      const res = await api('GET', url(path));
      expect(res.statusCode, `${path}: ${res.body}`).toBe(200);
    }
  });

  it('a member asking for someone else gets 403', async () => {
    for (const path of [`people/${fx.w.owner.id}`, `people/${fx.admin.user.id}.csv`]) {
      const res = await fx.member.api('GET', url(path));
      expect(res.statusCode, path).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
    }
  });

  it('admins and the owner can read anyone; a non-member person is 404', async () => {
    expect((await fx.admin.api('GET', url(`people/${fx.member.user.id}`))).statusCode).toBe(200);
    expect((await fx.w.api('GET', url(`people/${fx.member.user.id}.csv`))).statusCode).toBe(200);
    expect((await fx.w.api('GET', url(`people/${fx.outsider.user.id}`))).statusCode).toBe(404);
  });

  it('non-members get 404 everywhere', async () => {
    for (const path of [
      'overview',
      'workload.csv',
      'people/me',
      `sprints?projectId=${fx.w.project.id}`,
    ]) {
      const res = await fx.outsider.api('GET', url(path));
      expect(res.statusCode, path).toBe(404);
    }
  });

  it('signed-out callers get 401', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1${url('overview')}` });
    expect(res.statusCode).toBe(401);
  });

  it('a space or project from another workspace is 404', async () => {
    const foreignProject = await (async () => {
      const w2 = await taskWorld(ctx, 'Elsewhere');
      return w2.project;
    })();
    for (const path of [
      `overview?spaceId=${fx.foreignSpace.id}`,
      `overview?projectId=${foreignProject.id}`,
      `workload?projectId=${foreignProject.id}`,
      `sprints?projectId=${foreignProject.id}`,
      // A project outside the given space.
      `overview?spaceId=${(await createSpace(ctx.db, fx.w.ws.id, 'b0')).id}&projectId=${fx.w.project.id}`,
    ]) {
      const res = await fx.w.api('GET', url(path));
      expect(res.statusCode, path).toBe(404);
    }
  });

  it('CSV headers follow the caller’s language', async () => {
    const mn = await fx.member.api('GET', url('overview.csv'));
    expect(mn.body.startsWith('\uFEFFДугаар,Ажил,Төсөл')).toBe(true);
    expect(mn.headers['content-disposition']).toBe('attachment; filename="aging.csv"');
    const patched = await fx.member.api('PATCH', '/me', { locale: 'en' });
    expect(patched.statusCode, patched.body).toBe(200);
    const en = await fx.member.api('GET', url('overview.csv'));
    expect(en.body.split('\r\n')[0]).toBe(
      '\uFEFFKey,Task,Project,Assignee,Status,Priority,Size,Due date,Days in status,Stale',
    );
  });

  it('serves cached reports until a task changes', async () => {
    const first = overviewReportSchema.parse((await fx.w.api('GET', url('overview'))).json());
    const again = overviewReportSchema.parse((await fx.w.api('GET', url('overview'))).json());
    expect(again.generatedAt).toBe(first.generatedAt);
    expect(again.aging.total).toBe(first.aging.total);

    // A task created through the API emits an event, which drops the workspace's reports.
    const created = await fx.w.api('POST', `/projects/${fx.w.project.id}/tasks`, { title: 'New' });
    expect(created.statusCode, created.body).toBe(201);
    const after = overviewReportSchema.parse((await fx.w.api('GET', url('overview'))).json());
    expect(after.aging.total).toBe(first.aging.total + 1);
  });
});

describe('Reports cache expiry', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let now = new Date('2026-10-14T04:00:00Z');

  beforeAll(async () => {
    ctx = await createTestApp({ REPORTS_CACHE_TTL_MS: 300_000 }, { now: () => now });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('recomputes after 5 minutes', async () => {
    const w = await taskWorld(ctx);
    const get = async () =>
      overviewReportSchema.parse(
        (await w.api('GET', `/workspaces/${w.ws.id}/reports/overview`)).json(),
      );
    const first = await get();
    expect(first.generatedAt).toBe('2026-10-14T04:00:00.000Z');
    now = new Date('2026-10-14T04:04:59Z');
    expect((await get()).generatedAt).toBe(first.generatedAt);
    now = new Date('2026-10-14T04:05:00Z');
    expect((await get()).generatedAt).toBe('2026-10-14T04:05:00.000Z');
  });
});
