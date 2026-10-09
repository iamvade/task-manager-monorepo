import {
  projectDetailSchema,
  taskDetailSchema,
  taskListItemSchema,
  type CreateTask,
  type StatusCategory,
} from '@kite/shared';
import { asc, eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { z } from 'zod';
import { activity } from '../src/db/schema/index.js';
import { apiClient, createSpace, createUser, createWorkspace, login } from './fixtures.js';
import type { createTestApp } from './helpers.js';

type Ctx = Awaited<ReturnType<typeof createTestApp>>;

/** A signed-in owner with a workspace, a space and a project (with the default statuses). */
export async function taskWorld(ctx: Ctx, ownerName = 'Anu Bold') {
  const owner = await createUser(ctx.db, { name: ownerName });
  const ws = await createWorkspace(ctx.db, owner.id);
  const api = apiClient(ctx.app, await login(ctx.app, owner.email));
  const space = await createSpace(ctx.db, ws.id);

  const newProject = async (name = 'App', spaceId = space.id) => {
    const res = await api('POST', `/workspaces/${ws.id}/projects`, { spaceId, name });
    expect(res.statusCode, res.body).toBe(201);
    return projectDetailSchema.parse(res.json());
  };
  const project = await newProject();

  const status = (category: StatusCategory, p = project) => {
    const s = p.statuses.find((x) => x.category === category);
    if (!s) throw new Error(`no ${category} status`);
    return s;
  };
  const createTask = async (body: CreateTask, projectId = project.id) => {
    const res = await api('POST', `/projects/${projectId}/tasks`, body);
    expect(res.statusCode, res.body).toBe(201);
    return taskDetailSchema.parse(res.json());
  };
  const list = async (query = '', projectId = project.id) => {
    const res = await api('GET', `/projects/${projectId}/tasks${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return z.array(taskListItemSchema).parse(res.json());
  };
  const titles = async (query = '', projectId = project.id) =>
    (await list(query, projectId)).map((t) => t.title);
  const activities = (taskId: string) =>
    ctx.db
      .select()
      .from(activity)
      .where(eq(activity.taskId, taskId))
      .orderBy(asc(activity.createdAt), asc(activity.id));

  return {
    owner,
    ws,
    api,
    space,
    project,
    newProject,
    status,
    createTask,
    list,
    titles,
    activities,
  };
}
