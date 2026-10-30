import {
  archivedProjectSchema,
  projectDetailSchema,
  sidebarResponseSchema,
  spaceSchema,
  sprintSchema,
  statusSchema,
  type ProjectDetail,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { notifications, projects, taskAssignees, tasks } from '../src/db/schema/index.js';
import {
  addMember,
  apiClient,
  createUser,
  createWorkspace,
  errorCode,
  insertTask,
  login,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('spaces, projects and the sidebar', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function setup() {
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    const api = apiClient(ctx.app, await login(ctx.app, owner.email));
    const createSpace = async (name: string) =>
      spaceSchema.parse(
        (await api('POST', `/workspaces/${ws.id}/spaces`, { name, color: 'violet' })).json(),
      );
    const createProject = async (spaceId: string, name: string, extra: object = {}) => {
      const res = await api('POST', `/workspaces/${ws.id}/projects`, { spaceId, name, ...extra });
      expect(res.statusCode, res.body).toBe(201);
      return projectDetailSchema.parse(res.json());
    };
    return { owner, ws, api, createSpace, createProject };
  }

  async function addTask(project: ProjectDetail, statusIndex: number, number: number) {
    const status = project.statuses[statusIndex];
    if (!status) throw new Error('missing status');
    const [creator] = project.members;
    return insertTask(ctx.db, {
      projectId: project.id,
      number,
      statusId: status.id,
      title: `Task ${number}`,
      position: `a${number}`,
      createdBy: creator?.user.id ?? '',
    });
  }

  it('creates a project with a unique key, default statuses and the creator as member', async () => {
    const { owner, ws, api, createSpace, createProject } = await setup();
    const space = await createSpace('Product');

    const first = await createProject(space.id, 'Partner Portal');
    expect(first.key).toBe('PP');
    expect(first.statuses.map((s) => [s.name, s.category])).toEqual([
      [null, 'todo'],
      [null, 'in_progress'],
      [null, 'review'],
      [null, 'on_hold'],
      [null, 'done'],
      [null, 'cancelled'],
    ]);
    expect(first.members.map((m) => m.user.id)).toEqual([owner.id]);
    expect(first).toMatchObject({
      taskCount: 0,
      doneCount: 0,
      activeSprint: null,
      isFavorite: false,
    });

    const second = await createProject(space.id, 'Partner Portal');
    expect(second.key).toBe('PPO');
    expect(second.position > first.position).toBe(true);

    const suggestion = await api(
      'GET',
      `/workspaces/${ws.id}/project-key-suggestion?name=${encodeURIComponent('Partner Portal')}`,
    );
    expect(suggestion.json()).toEqual({ key: 'PPOR' });

    const custom = await createProject(space.id, 'Checkout', { key: 'chk' });
    expect(custom.key).toBe('CHK');

    const taken = await api('POST', `/workspaces/${ws.id}/projects`, {
      spaceId: space.id,
      name: 'Other',
      key: 'CHK',
    });
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe('PROJECT_KEY_TAKEN');

    const renameKey = await api('PATCH', `/projects/${custom.id}`, { key: 'PP' });
    expect(renameKey.statusCode).toBe(409);
    expect(errorCode(renameKey)).toBe('PROJECT_KEY_TAKEN');

    const badKey = await api('PATCH', `/projects/${custom.id}`, { key: '1X' });
    expect(badKey.statusCode).toBe(400);

    const updated = await api('PATCH', `/projects/${custom.id}`, {
      name: 'Checkout v2',
      key: 'CO2',
    });
    expect(projectDetailSchema.parse(updated.json())).toMatchObject({
      name: 'Checkout v2',
      key: 'CO2',
      description: null,
    });

    // The brief: stored with its plain text; unsafe links and non-doc roots are refused.
    const brief = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Goal: ship v2' }] }],
    };
    const withBrief = await api('PATCH', `/projects/${custom.id}`, { description: brief });
    expect(withBrief.statusCode, withBrief.body).toBe(200);
    expect(projectDetailSchema.parse(withBrief.json()).description).toEqual(brief);
    const [row] = await ctx.db
      .select({ text: projects.descriptionText })
      .from(projects)
      .where(eq(projects.id, custom.id));
    expect(row?.text).toBe('Goal: ship v2');
    const evil = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    expect((await api('PATCH', `/projects/${custom.id}`, { description: evil })).statusCode).toBe(
      400,
    );
    const cleared = await api('PATCH', `/projects/${custom.id}`, { description: null });
    expect(projectDetailSchema.parse(cleared.json()).description).toBeNull();
  });

  it('reports task counts per status and the active sprint', async () => {
    const { api, createSpace, createProject } = await setup();
    const project = await createProject((await createSpace('Eng')).id, 'Platform');
    await addTask(project, 0, 1);
    await addTask(project, 0, 2);
    const done = await addTask(project, 4, 3);
    const deleted = await addTask(project, 4, 4);
    await ctx.db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, deleted.id));

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format();
    const past = await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
      projectIds: [project.id],
      name: 'Old',
      startDate: '2020-01-01',
      endDate: '2020-01-14',
    });
    expect(past.statusCode).toBe(201);
    const current = sprintSchema.parse(
      (
        await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
          projectIds: [project.id],
          name: 'Now',
          startDate: today,
          endDate: today,
        })
      ).json(),
    );
    const backwards = await api('POST', `/workspaces/${project.workspaceId}/sprints`, {
      projectIds: [project.id],
      name: 'Bad',
      startDate: '2026-10-10',
      endDate: '2026-10-01',
    });
    expect(backwards.statusCode).toBe(400);

    const detail = projectDetailSchema.parse((await api('GET', `/projects/${project.id}`)).json());
    expect(detail.taskCounts.map((c) => c.count)).toEqual([2, 0, 0, 0, 1, 0]);
    expect(detail.taskCount).toBe(3);
    expect(detail.doneCount).toBe(1);
    expect(detail.activeSprint?.id).toBe(current.id);
    expect(done.statusId).toBe(detail.statuses[4]?.id);

    const sprints = z
      .array(sprintSchema)
      .parse((await api('GET', `/workspaces/${project.workspaceId}/sprints`)).json());
    expect(sprints.map((s) => s.name)).toEqual(['Old', 'Now']);
    const statuses = z
      .array(statusSchema)
      .parse((await api('GET', `/projects/${project.id}/statuses`)).json());
    expect(statuses).toEqual(detail.statuses);
  });

  it('builds the sidebar in one request', async () => {
    const { owner, ws, api, createSpace, createProject } = await setup();
    const engineering = await createSpace('Engineering');
    const product = await createSpace('Product');
    // Move Product above Engineering.
    const moved = await api('POST', `/spaces/${product.id}/move`, { nextId: engineering.id });
    expect(moved.statusCode).toBe(200);

    const app = await createProject(product.id, 'App Redesign');
    const roadmap = await createProject(product.id, 'Q4 Roadmap');
    const archived = await createProject(product.id, 'Old stuff');
    const platform = await createProject(engineering.id, 'Platform');
    // Roadmap first within Product.
    await api('POST', `/projects/${roadmap.id}/move`, { nextId: app.id });
    // Platform moves into Product, last.
    await api('POST', `/projects/${platform.id}/move`, { spaceId: product.id });
    expect((await api('POST', `/projects/${archived.id}/archive`)).statusCode).toBe(200);
    expect((await api('PUT', `/projects/${app.id}/favorite`)).statusCode).toBe(204);
    expect((await api('PUT', `/projects/${app.id}/favorite`)).statusCode).toBe(204);
    await api('PUT', `/projects/${archived.id}/favorite`);

    // Two open tasks and one done task assigned to me, one task assigned to someone else.
    const other = await createUser(ctx.db);
    await addMember(ctx.db, ws.id, other.id);
    const t1 = await addTask(app, 0, 1);
    const t2 = await addTask(app, 1, 2);
    const t3 = await addTask(app, 4, 3);
    const t4 = await addTask(app, 0, 4);
    const tArchived = await addTask(archived, 0, 1);
    await ctx.db.insert(taskAssignees).values([
      { taskId: t1.id, userId: owner.id },
      { taskId: t2.id, userId: owner.id },
      { taskId: t3.id, userId: owner.id },
      { taskId: t4.id, userId: other.id },
      { taskId: tArchived.id, userId: owner.id },
    ]);
    await ctx.db.insert(notifications).values([
      { userId: owner.id, type: 'assigned', taskId: t1.id, actorId: other.id },
      { userId: owner.id, type: 'comment', taskId: t2.id, actorId: other.id },
      { userId: owner.id, type: 'comment', taskId: t2.id, actorId: other.id, readAt: new Date() },
      {
        userId: owner.id,
        type: 'mention',
        taskId: t2.id,
        actorId: other.id,
        archivedAt: new Date(),
      },
      { userId: other.id, type: 'mention', taskId: t1.id, actorId: owner.id },
    ]);

    const res = await api('GET', `/workspaces/${ws.id}/sidebar`);
    expect(res.statusCode).toBe(200);
    const sidebar = sidebarResponseSchema.parse(res.json());
    expect(sidebar.spaces.map((s) => [s.name, s.projects.map((p) => p.name)])).toEqual([
      ['Product', ['Q4 Roadmap', 'App Redesign', 'Platform']],
      ['Engineering', []],
    ]);
    expect(sidebar.favorites.map((p) => p.id)).toEqual([app.id]);
    expect(sidebar.myTasksCount).toBe(2);
    expect(sidebar.inboxUnreadCount).toBe(2);

    await api('DELETE', `/projects/${app.id}/favorite`);
    const after = sidebarResponseSchema.parse(
      (await api('GET', `/workspaces/${ws.id}/sidebar`)).json(),
    );
    expect(after.favorites).toEqual([]);

    // The archived project is still readable, and can come back.
    const archivedDetail = projectDetailSchema.parse(
      (await api('GET', `/projects/${archived.id}`)).json(),
    );
    expect(archivedDetail.archivedAt).not.toBeNull();
    const listArchived = async () =>
      z
        .array(archivedProjectSchema)
        .parse((await api('GET', `/workspaces/${ws.id}/archived-projects`)).json());
    // Most recently archived first, with the space.
    await api('POST', `/projects/${roadmap.id}/archive`);
    expect((await listArchived()).map((p) => [p.name, p.space.name])).toEqual([
      ['Q4 Roadmap', 'Product'],
      ['Old stuff', 'Product'],
    ]);
    await api('POST', `/projects/${roadmap.id}/unarchive`);
    await api('POST', `/projects/${archived.id}/unarchive`);
    const [row] = await ctx.db.select().from(projects).where(eq(projects.id, archived.id));
    expect(row?.archivedAt).toBeNull();
    expect(await listArchived()).toEqual([]);
  });

  it('deletes only empty spaces and validates moves', async () => {
    const { api, createSpace, createProject } = await setup();
    const a = await createSpace('A');
    const b = await createSpace('B');
    expect(a.initial).toBe('A');
    const p = await createProject(a.id, 'Thing');

    const notEmpty = await api('DELETE', `/spaces/${a.id}`);
    expect(notEmpty.statusCode).toBe(409);
    expect(errorCode(notEmpty)).toBe('SPACE_NOT_EMPTY');

    const self = await api('POST', `/spaces/${a.id}/move`, { prevId: a.id });
    expect(self.statusCode).toBe(400);
    const reversed = await api('POST', `/spaces/${a.id}/move`, { prevId: b.id, nextId: b.id });
    expect(reversed.statusCode).toBe(400);
    const wrongScope = await api('POST', `/spaces/${a.id}/move`, { prevId: p.id });
    expect(wrongScope.statusCode).toBe(400);

    expect((await api('DELETE', `/spaces/${b.id}`)).statusCode).toBe(204);

    const renamed = spaceSchema.parse(
      (
        await api('PATCH', `/spaces/${a.id}`, { name: 'Дизайн', initial: 'Д', color: 'rose' })
      ).json(),
    );
    expect(renamed).toMatchObject({ name: 'Дизайн', initial: 'Д', color: 'rose' });
    expect((await api('PATCH', `/spaces/${a.id}`, {})).statusCode).toBe(400);
  });

  it('lets only admins and owners rename and reorder spaces and projects', async () => {
    const { ws, createSpace, createProject } = await setup();
    const a = await createSpace('A');
    const b = await createSpace('B');
    const p = await createProject(a.id, 'Thing');
    const member = await createUser(ctx.db);
    await addMember(ctx.db, ws.id, member.id);
    const asMember = apiClient(ctx.app, await login(ctx.app, member.email));

    for (const [method, url, body] of [
      ['PATCH', `/spaces/${a.id}`, { name: 'Renamed' }],
      ['POST', `/spaces/${a.id}/move`, { prevId: b.id }],
      ['PATCH', `/projects/${p.id}`, { name: 'Renamed' }],
      ['PATCH', `/projects/${p.id}`, { color: 'rose' }],
      ['POST', `/projects/${p.id}/move`, { spaceId: b.id }],
    ] as const) {
      const res = await asMember(method, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
    }
    // The brief and the lead stay open to every member.
    const lead = await asMember('PATCH', `/projects/${p.id}`, { leadId: member.id });
    expect(lead.statusCode, lead.body).toBe(200);

    const admin = await createUser(ctx.db);
    await addMember(ctx.db, ws.id, admin.id, 'admin');
    const asAdmin = apiClient(ctx.app, await login(ctx.app, admin.email));
    expect((await asAdmin('PATCH', `/spaces/${a.id}`, { name: 'Design' })).statusCode).toBe(200);
    expect((await asAdmin('POST', `/spaces/${a.id}/move`, { prevId: b.id })).statusCode).toBe(200);
    expect((await asAdmin('PATCH', `/projects/${p.id}`, { name: 'Web' })).statusCode).toBe(200);
    const moved = await asAdmin('POST', `/projects/${p.id}/move`, { spaceId: b.id });
    expect(projectDetailSchema.parse(moved.json())).toMatchObject({ spaceId: b.id, name: 'Web' });
  });

  it('tells the workspace when spaces or projects change, except the tab that changed them', async () => {
    const { ws, api, createSpace, createProject } = await setup();
    const publish = vi.spyOn(ctx.app.realtime.broadcaster, 'publish');
    try {
      const a = await createSpace('A');
      const b = await createSpace('B');
      const p = await createProject(a.id, 'Thing');
      await api('PATCH', `/spaces/${a.id}`, { name: 'Renamed' });
      await api('POST', `/spaces/${b.id}/move`, { nextId: a.id });
      await api('PATCH', `/projects/${p.id}`, { name: 'Other' });
      await api('POST', `/projects/${p.id}/move`, { spaceId: b.id });
      // A brief edit doesn't touch the sidebar.
      await api('PATCH', `/projects/${p.id}`, { description: null });
      const sent = publish.mock.calls
        .map(([envelope]) => envelope)
        .filter((e) => e.message.type === 'spaces.changed');
      expect(sent).toHaveLength(7);
      for (const e of sent) {
        expect(e.to).toEqual({ workspaceId: ws.id });
        expect(e.message).toMatchObject({ workspaceId: ws.id });
      }
    } finally {
      publish.mockRestore();
    }
  });

  it('manages tags and project members', async () => {
    const { ws, api, createSpace, createProject } = await setup();
    const tag = await api('POST', `/workspaces/${ws.id}/tags`, { name: 'Research', color: 'blue' });
    expect(tag.statusCode).toBe(201);
    const dup = await api('POST', `/workspaces/${ws.id}/tags`, {
      name: 'Research',
      color: 'green',
    });
    expect(dup.statusCode).toBe(409);
    expect(errorCode(dup)).toBe('TAG_EXISTS');
    await api('POST', `/workspaces/${ws.id}/tags`, { name: 'A11y', color: 'green' });
    const { id } = tag.json<{ id: string }>();
    const recolored = await api('PATCH', `/tags/${id}`, { color: 'teal' });
    expect(recolored.json()).toMatchObject({ name: 'Research', color: 'teal' });
    expect((await api('PATCH', `/tags/${id}`, { name: 'A11y' })).statusCode).toBe(409);
    expect((await api('PATCH', `/tags/${id}`, { color: 'nope' })).statusCode).toBe(400);
    const list = (await api('GET', `/workspaces/${ws.id}/tags`)).json<{ name: string }[]>();
    expect(list.map((t) => t.name)).toEqual(['A11y', 'Research']);
    expect((await api('DELETE', `/tags/${id}`)).statusCode).toBe(204);

    const project = await createProject((await createSpace('S')).id, 'Team');
    const mate = await createUser(ctx.db, { name: 'Aaron Mate' });
    await addMember(ctx.db, ws.id, mate.id);
    const added = await api('PUT', `/projects/${project.id}/members/${mate.id}`);
    expect(added.statusCode).toBe(200);
    expect(added.json()).toMatchObject({
      user: { id: mate.id, name: 'Aaron Mate' },
      role: 'member',
    });
    await api('PUT', `/projects/${project.id}/members/${mate.id}`);
    const members = (await api('GET', `/projects/${project.id}/members`)).json<
      { user: { id: string } }[]
    >();
    expect(members.map((m) => m.user.id)).toContain(mate.id);
    expect(members).toHaveLength(2);
    expect((await api('DELETE', `/projects/${project.id}/members/${mate.id}`)).statusCode).toBe(
      204,
    );
    const left = (await api('GET', `/projects/${project.id}/members`)).json<unknown[]>();
    expect(left).toHaveLength(1);

    const all = (await api('GET', `/workspaces/${ws.id}/members`)).json<unknown[]>();
    expect(all).toHaveLength(2);
  });
});
