import { projectSummarySchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addMember,
  createProject,
  createUser,
  createWorkspace,
  login,
  errorCode,
} from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('project access', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const getProject = (id: string, cookie?: string) =>
    ctx.app.inject({
      method: 'GET',
      url: `/api/v1/projects/${id}`,
      headers: cookie ? { cookie } : {},
    });

  it('lets a member read their workspace project', async () => {
    const owner = await createUser(ctx.db);
    const member = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    await addMember(ctx.db, ws.id, member.id);
    const project = await createProject(ctx.db, ws.id);

    const res = await getProject(project.id, await login(ctx.app, member.email));
    expect(res.statusCode).toBe(200);
    expect(projectSummarySchema.parse(res.json())).toMatchObject({
      id: project.id,
      workspaceId: ws.id,
      key: project.key,
    });
  });

  it("answers 404 for another workspace's project", async () => {
    const alice = await createUser(ctx.db);
    const bob = await createUser(ctx.db);
    await createWorkspace(ctx.db, alice.id);
    const bobsWs = await createWorkspace(ctx.db, bob.id);
    const bobsProject = await createProject(ctx.db, bobsWs.id);

    const res = await getProject(bobsProject.id, await login(ctx.app, alice.email));
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
  });

  it('answers 404 for a project that does not exist', async () => {
    const user = await createUser(ctx.db);
    const res = await getProject(
      '01890000-0000-7000-8000-000000000000',
      await login(ctx.app, user.email),
    );
    expect(res.statusCode).toBe(404);
  });

  it('requires a session', async () => {
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    const project = await createProject(ctx.db, ws.id);
    expect((await getProject(project.id)).statusCode).toBe(401);
  });
});
