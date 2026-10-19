import { projectDetailSchema, sprintSchema, sprintWithUsageSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createProject, createWorkspace, errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

describe('workspace sprints shared by projects', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function world() {
    const w = await taskWorld(ctx);
    const other = await w.newProject('Checkout');
    const create = async (
      projectIds: string[],
      body: Record<string, unknown> = {},
      api = w.api,
    ) => {
      const res = await api('POST', `/workspaces/${w.ws.id}/sprints`, {
        startDate: '2026-10-05',
        endDate: '2026-10-16',
        projectIds,
        ...body,
      });
      expect(res.statusCode, res.body).toBe(201);
      return sprintSchema.parse(res.json());
    };
    const list = async () =>
      z
        .array(sprintWithUsageSchema)
        .parse((await w.api('GET', `/workspaces/${w.ws.id}/sprints`)).json());
    return { ...w, other, create, list };
  }

  it('numbers sprints per workspace and lists them with their projects and task counts', async () => {
    const w = await world();
    const a = await w.create([w.project.id]);
    const b = await w.create([w.project.id, w.other.id, w.other.id], {
      name: 'Platform 1',
      startDate: '2026-10-19',
      endDate: '2026-10-30',
    });
    expect(a).toMatchObject({ number: 1, name: null, projectIds: [w.project.id] });
    expect(b.number).toBe(2);
    expect(b.projectIds).toEqual([w.project.id, w.other.id].sort());
    expect(b.createdBy).toBe(w.owner.id);

    await w.createTask({ title: 'Here', sprintId: b.id }, w.other.id);
    expect((await w.list()).map((s) => [s.number, s.taskCount])).toEqual([
      [1, 0],
      [2, 1],
    ]);

    // Numbers keep counting in parallel creates.
    const many = await Promise.all([1, 2, 3, 4].map(() => w.create([w.project.id])));
    expect(many.map((s) => s.number).sort()).toEqual([3, 4, 5, 6]);
  });

  it('rejects projects of another workspace, archived projects and an empty list', async () => {
    const w = await world();
    const foreign = await createProject(ctx.db, (await createWorkspace(ctx.db, w.owner.id)).id);
    const archived = await w.newProject('Old');
    await w.api('POST', `/projects/${archived.id}/archive`);

    for (const projectIds of [[foreign.id], [archived.id], []]) {
      const res = await w.api('POST', `/workspaces/${w.ws.id}/sprints`, {
        startDate: '2026-10-05',
        endDate: '2026-10-16',
        projectIds,
      });
      expect(res.statusCode).toBe(400);
    }
  });

  it('lets a task into a sprint only from a project it covers', async () => {
    const w = await world();
    const sprint = await w.create([w.project.id]);
    const res = await w.api('POST', `/projects/${w.other.id}/tasks`, {
      title: 'Wrong project',
      sprintId: sprint.id,
    });
    expect(errorCode(res)).toBe('INVALID_REFERENCE');

    const task = await w.createTask({ title: 'Outside' }, w.other.id);
    const patch = await w.api('PATCH', `/tasks/${task.id}`, { sprintId: sprint.id });
    expect(errorCode(patch)).toBe('INVALID_REFERENCE');

    // Once the sprint covers the project, it can.
    const edited = await w.api('PATCH', `/sprints/${sprint.id}`, {
      projectIds: [w.project.id, w.other.id],
    });
    expect(edited.statusCode, edited.body).toBe(200);
    const again = await w.api('PATCH', `/tasks/${task.id}`, { sprintId: sprint.id });
    expect(again.statusCode, again.body).toBe(200);
  });

  it('shows the active sprint on every project it covers', async () => {
    const w = await world();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ulaanbaatar' }).format();
    const sprint = await w.create([w.project.id, w.other.id], { startDate: today, endDate: today });
    for (const id of [w.project.id, w.other.id]) {
      const detail = projectDetailSchema.parse((await w.api('GET', `/projects/${id}`)).json());
      expect(detail.activeSprint?.id).toBe(sprint.id);
      expect(detail.activeSprint?.projectIds).toHaveLength(2);
    }
  });

  it('edits name, dates and projects; refuses to drop a project whose tasks are in it', async () => {
    const w = await world();
    const sprint = await w.create([w.project.id, w.other.id]);
    await w.createTask({ title: 'Mine', sprintId: sprint.id }, w.other.id);

    const renamed = await w.api('PATCH', `/sprints/${sprint.id}`, {
      name: 'Release',
      endDate: '2026-10-20',
    });
    expect(sprintSchema.parse(renamed.json())).toMatchObject({
      name: 'Release',
      startDate: '2026-10-05',
      endDate: '2026-10-20',
    });
    const backwards = await w.api('PATCH', `/sprints/${sprint.id}`, { endDate: '2026-10-01' });
    expect(backwards.statusCode).toBe(400);
    const cleared = await w.api('PATCH', `/sprints/${sprint.id}`, { name: null });
    expect(sprintSchema.parse(cleared.json()).name).toBeNull();

    const drop = await w.api('PATCH', `/sprints/${sprint.id}`, { projectIds: [w.project.id] });
    expect(drop.statusCode).toBe(409);
    expect(errorCode(drop)).toBe('SPRINT_PROJECT_IN_USE');
    const dropEmpty = await w.api('PATCH', `/sprints/${sprint.id}`, { projectIds: [w.other.id] });
    expect(sprintSchema.parse(dropEmpty.json()).projectIds).toEqual([w.other.id]);
  });

  it('deletes only a sprint no task has been in', async () => {
    const w = await world();
    const unused = await w.create([w.project.id]);
    const used = await w.create([w.project.id]);
    const task = await w.createTask({ title: 'Was here', sprintId: used.id });
    await w.api('PATCH', `/tasks/${task.id}`, { sprintId: null });

    const res = await w.api('DELETE', `/sprints/${used.id}`);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('SPRINT_IN_USE');
    expect((await w.api('DELETE', `/sprints/${unused.id}`)).statusCode).toBe(204);
    expect((await w.list()).map((s) => s.id)).toEqual([used.id]);
  });

  it('lets any member create, but only admins and the creator edit or delete', async () => {
    const w = await world();
    const sara = await w.person('member', 'Sara');
    const dorj = await w.person('member', 'Dorj');
    const admin = await w.person('admin', 'Bat');
    const outsider = await w.person(null, 'Outsider');

    const mine = await w.create([w.project.id], {}, sara.api);
    const owners = await w.create([w.project.id]);
    expect((await sara.api('PATCH', `/sprints/${mine.id}`, { name: 'Mine' })).statusCode).toBe(200);
    expect((await dorj.api('PATCH', `/sprints/${mine.id}`, { name: 'No' })).statusCode).toBe(403);
    expect((await sara.api('DELETE', `/sprints/${owners.id}`)).statusCode).toBe(403);
    expect((await admin.api('PATCH', `/sprints/${owners.id}`, { name: 'Ok' })).statusCode).toBe(
      200,
    );
    expect((await outsider.api('PATCH', `/sprints/${mine.id}`, { name: 'x' })).statusCode).toBe(
      404,
    );
    expect((await outsider.api('GET', `/workspaces/${w.ws.id}/sprints`)).statusCode).toBe(404);
    expect((await sara.api('DELETE', `/sprints/${mine.id}`)).statusCode).toBe(204);
  });

  it('keeps the sprint when a task moves to a project it covers, else clears it', async () => {
    const w = await world();
    const third = await w.newProject('Third');
    const sprint = await w.create([w.project.id, w.other.id]);
    const task = await w.createTask({ title: 'Moving', sprintId: sprint.id });

    const kept = await w.api('POST', `/tasks/${task.id}/move-to-project`, {
      projectId: w.other.id,
    });
    expect(kept.statusCode, kept.body).toBe(200);
    expect(kept.json<{ sprintId: string | null }>().sprintId).toBe(sprint.id);

    const cleared = await w.api('POST', `/tasks/${task.id}/move-to-project`, {
      projectId: third.id,
    });
    expect(cleared.json<{ sprintId: string | null }>().sprintId).toBeNull();
    const logged = (await w.activities(task.id)).filter((a) => a.type === 'sprint.changed');
    expect(logged.map((a) => a.payload)).toEqual([
      { from: null, to: { id: sprint.id, name: null, number: 1 } },
      { from: { id: sprint.id, name: null, number: 1 }, to: null },
    ]);
  });
});
