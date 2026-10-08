import {
  addDays,
  applyTemplateResponseSchema,
  projectDetailSchema,
  spaceSchema,
  todayInZone,
  type Locale,
} from '@kite/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activity,
  projects,
  sprints,
  tags,
  taskFollowers,
  taskTags,
  tasks,
  users,
} from '../src/db/schema/index.js';
import { apiClient, createUser, createWorkspace, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('POST /projects/:id/from-template', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function setup(locale: Locale = 'en') {
    const owner = await createUser(ctx.db);
    await ctx.db.update(users).set({ locale }).where(eq(users.id, owner.id));
    const ws = await createWorkspace(ctx.db, owner.id);
    const api = apiClient(ctx.app, await login(ctx.app, owner.email));
    const space = spaceSchema.parse(
      (
        await api('POST', `/workspaces/${ws.id}/spaces`, { name: 'Product', color: 'violet' })
      ).json(),
    );
    const newProject = async (name = 'Launch') =>
      projectDetailSchema.parse(
        (await api('POST', `/workspaces/${ws.id}/projects`, { spaceId: space.id, name })).json(),
      );
    return { owner, ws, api, newProject };
  }

  const projectTasks = (projectId: string) =>
    ctx.db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(asc(tasks.number));

  it('creates the 18 product-launch tasks with numbers, positions, followers and activity', async () => {
    const { owner, api, newProject } = await setup('en');
    const project = await newProject();

    const res = await api('POST', `/projects/${project.id}/from-template`, {
      templateId: 'product-launch',
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = applyTemplateResponseSchema.parse(res.json());
    expect(body.createdCount).toBe(18);
    expect(body.project.taskCount).toBe(18);
    expect(body.project.taskCounts[0]?.count).toBe(18);

    const rows = await projectTasks(project.id);
    expect(rows.map((t) => t.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    const positions = rows.map((t) => t.position);
    expect([...positions].sort()).toEqual(positions);
    expect(new Set(positions).size).toBe(18);
    expect(
      rows.every((t) => t.createdBy === owner.id && t.statusId === project.statuses[0]?.id),
    ).toBe(true);
    expect(rows[0]?.title).toBe('Define launch goals and success metrics');
    const today = todayInZone(owner.timezone);
    expect(rows[0]?.dueDate).toBe(addDays(today, 2));
    expect(rows[17]?.dueDate).toBe(addDays(today, 35));

    const [updated] = await ctx.db.select().from(projects).where(eq(projects.id, project.id));
    expect(updated?.taskSeq).toBe(18);

    const ids = rows.map((t) => t.id);
    const events = await ctx.db.select().from(activity).where(inArray(activity.taskId, ids));
    expect(events).toHaveLength(18);
    expect(events.every((e) => e.type === 'task.created' && e.actorId === owner.id)).toBe(true);
    expect(events[0]?.payload).toEqual({ templateId: 'product-launch' });
    const followers = await ctx.db
      .select()
      .from(taskFollowers)
      .where(inArray(taskFollowers.taskId, ids));
    expect(followers).toHaveLength(18);
  });

  it('puts sprint-planning tasks into a new two-week sprint that is active today', async () => {
    const { owner, api, newProject } = await setup('en');
    const project = await newProject();

    const res = await api('POST', `/projects/${project.id}/from-template`, {
      templateId: 'sprint-planning',
    });
    expect(res.statusCode).toBe(201);
    const body = applyTemplateResponseSchema.parse(res.json());
    expect(body.createdCount).toBe(12);

    const today = todayInZone(owner.timezone);
    const sprintRows = await ctx.db.select().from(sprints).where(eq(sprints.projectId, project.id));
    expect(sprintRows).toHaveLength(1);
    const [sprint] = sprintRows;
    expect(sprint).toMatchObject({
      name: 'Sprint 1',
      startDate: today,
      endDate: addDays(today, 13),
    });
    expect(body.project.activeSprint?.id).toBe(sprint?.id);

    const rows = await projectTasks(project.id);
    expect(rows).toHaveLength(12);
    expect(rows.every((t) => t.sprintId === sprint?.id)).toBe(true);
    expect(rows.every((t) => t.dueDate !== null && t.dueDate <= addDays(today, 13))).toBe(true);
  });

  it('tags bug-triage tasks with severity tags, reusing them across projects', async () => {
    const { ws, api, newProject } = await setup('en');
    // An existing S1 tag in the workspace is reused, not duplicated.
    await api('POST', `/workspaces/${ws.id}/tags`, { name: 'S1', color: 'rose' });
    const first = await newProject('Bugs');
    const second = await newProject('More bugs');

    for (const project of [first, second]) {
      const res = await api('POST', `/projects/${project.id}/from-template`, {
        templateId: 'bug-triage',
      });
      expect(res.statusCode).toBe(201);
      expect(applyTemplateResponseSchema.parse(res.json()).createdCount).toBe(6);
    }

    const tagRows = await ctx.db
      .select()
      .from(tags)
      .where(eq(tags.workspaceId, ws.id))
      .orderBy(asc(tags.name));
    expect(tagRows.map((t) => [t.name, t.color])).toEqual([
      ['S1', 'rose'],
      ['S2', 'orange'],
      ['S3', 'blue'],
      ['S4', 'neutral'],
    ]);

    const rows = await projectTasks(first.id);
    expect(rows).toHaveLength(6);
    const links = await ctx.db
      .select({ number: tasks.number, tag: tags.name, priority: tasks.priority })
      .from(taskTags)
      .innerJoin(tasks, eq(tasks.id, taskTags.taskId))
      .innerJoin(tags, eq(tags.id, taskTags.tagId))
      .where(eq(tasks.projectId, first.id))
      .orderBy(asc(tasks.number));
    expect(links.map((l) => l.tag)).toEqual(['S1', 'S2', 'S2', 'S3', 'S3', 'S4']);
    expect(links[0]?.priority).toBe('urgent');
  });

  it('uses Mongolian titles for a Mongolian-speaking caller', async () => {
    const { api, newProject } = await setup('mn');
    const project = await newProject();
    await api('POST', `/projects/${project.id}/from-template`, { templateId: 'sprint-planning' });
    const [first] = await projectTasks(project.id);
    expect(first?.title).toBe('Спринт төлөвлөлтийн уулзалт');
    const [sprint] = await ctx.db.select().from(sprints).where(eq(sprints.projectId, project.id));
    expect(sprint?.name).toBe('Спринт 1');
  });

  it('refuses a project that already has tasks, and unknown templates', async () => {
    const { api, newProject } = await setup('en');
    const project = await newProject();
    const apply = (templateId: string) =>
      api('POST', `/projects/${project.id}/from-template`, { templateId });

    expect((await apply('bug-triage')).statusCode).toBe(201);
    const again = await apply('bug-triage');
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe('PROJECT_NOT_EMPTY');
    expect(await projectTasks(project.id)).toHaveLength(6);

    const unknown = await apply('kanban-magic');
    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('VALIDATION_ERROR');
  });

  it('applies again once every task is deleted, continuing the numbering', async () => {
    const { api, newProject } = await setup('en');
    const project = await newProject();
    await api('POST', `/projects/${project.id}/from-template`, { templateId: 'bug-triage' });
    await ctx.db
      .update(tasks)
      .set({ deletedAt: new Date() })
      .where(and(eq(tasks.projectId, project.id)));

    const res = await api('POST', `/projects/${project.id}/from-template`, {
      templateId: 'bug-triage',
    });
    expect(res.statusCode).toBe(201);
    const rows = await projectTasks(project.id);
    expect(rows.map((t) => t.number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    const live = rows.filter((t) => t.deletedAt === null);
    const deletedMax = rows
      .filter((t) => t.deletedAt !== null)
      .map((t) => t.position)
      .sort()
      .at(-1);
    expect(live.every((t) => deletedMax !== undefined && t.position > deletedMax)).toBe(true);
  });

  it('handles concurrent applies: exactly one wins', async () => {
    const { api, newProject } = await setup('en');
    const project = await newProject();
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        api('POST', `/projects/${project.id}/from-template`, { templateId: 'bug-triage' }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
    expect(await projectTasks(project.id)).toHaveLength(6);
  });
});
