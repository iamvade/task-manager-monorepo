import { projectDetailSchema, spaceSchema, tagSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addMember, apiClient, createUser, createWorkspace, errorCode, login } from './fixtures.js';
import { createTestApp } from './helpers.js';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Call = [method: Method, path: string, body?: Record<string, unknown>];

describe('structural API access control', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const ids = {} as Record<
    | 'ws'
    | 'space'
    | 'emptySpace'
    | 'project'
    | 'tag'
    | 'member'
    | 'outsider'
    | 'otherSpace'
    | 'otherProject',
    string
  >;
  const cookies = {} as Record<'owner' | 'admin' | 'member' | 'outsider', string>;
  const as = (who: keyof typeof cookies) => apiClient(ctx.app, cookies[who]);

  beforeAll(async () => {
    ctx = await createTestApp();
    const [owner, admin, member, outsider] = await Promise.all([
      createUser(ctx.db),
      createUser(ctx.db),
      createUser(ctx.db),
      createUser(ctx.db),
    ]);
    const ws = await createWorkspace(ctx.db, owner.id);
    await addMember(ctx.db, ws.id, admin.id, 'admin');
    await addMember(ctx.db, ws.id, member.id, 'member');
    const otherWs = await createWorkspace(ctx.db, outsider.id);
    for (const [who, user] of Object.entries({ owner, admin, member, outsider })) {
      cookies[who as keyof typeof cookies] = await login(ctx.app, user.email);
    }
    ids.ws = ws.id;
    ids.member = member.id;
    ids.outsider = outsider.id;

    const owners = as('owner');
    const space = spaceSchema.parse(
      (
        await owners('POST', `/workspaces/${ws.id}/spaces`, { name: 'Product', color: 'violet' })
      ).json(),
    );
    ids.space = space.id;
    ids.emptySpace = spaceSchema.parse(
      (
        await owners('POST', `/workspaces/${ws.id}/spaces`, { name: 'Empty', color: 'green' })
      ).json(),
    ).id;
    ids.project = projectDetailSchema.parse(
      (
        await owners('POST', `/workspaces/${ws.id}/projects`, { spaceId: space.id, name: 'App' })
      ).json(),
    ).id;
    ids.tag = tagSchema.parse(
      (await owners('POST', `/workspaces/${ws.id}/tags`, { name: 'UX', color: 'violet' })).json(),
    ).id;

    const outsiders = as('outsider');
    ids.otherSpace = spaceSchema.parse(
      (
        await outsiders('POST', `/workspaces/${otherWs.id}/spaces`, { name: 'X', color: 'rose' })
      ).json(),
    ).id;
    ids.otherProject = projectDetailSchema.parse(
      (
        await outsiders('POST', `/workspaces/${otherWs.id}/projects`, {
          spaceId: ids.otherSpace,
          name: 'Secret',
        })
      ).json(),
    ).id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  const calls = (): Call[] => [
    ['GET', `/workspaces/${ids.ws}/sidebar`],
    ['GET', `/workspaces/${ids.ws}/members`],
    ['GET', `/workspaces/${ids.ws}/project-key-suggestion?name=Checkout`],
    ['POST', `/workspaces/${ids.ws}/spaces`, { name: 'New', color: 'sky' }],
    ['PATCH', `/spaces/${ids.space}`, { name: 'Renamed' }],
    ['POST', `/spaces/${ids.space}/move`, {}],
    ['DELETE', `/spaces/${ids.emptySpace}`],
    ['POST', `/workspaces/${ids.ws}/projects`, { spaceId: ids.space, name: 'Another' }],
    ['GET', `/projects/${ids.project}`],
    ['PATCH', `/projects/${ids.project}`, { color: 'teal' }],
    ['POST', `/projects/${ids.project}/move`, {}],
    ['POST', `/projects/${ids.project}/archive`],
    ['POST', `/projects/${ids.project}/unarchive`],
    ['PUT', `/projects/${ids.project}/favorite`],
    ['DELETE', `/projects/${ids.project}/favorite`],
    ['GET', `/projects/${ids.project}/members`],
    ['PUT', `/projects/${ids.project}/members/${ids.member}`],
    ['DELETE', `/projects/${ids.project}/members/${ids.member}`],
    ['GET', `/workspaces/${ids.ws}/tags`],
    ['POST', `/workspaces/${ids.ws}/tags`, { name: 'New tag', color: 'blue' }],
    ['PATCH', `/tags/${ids.tag}`, { color: 'green' }],
    ['DELETE', `/tags/${ids.tag}`],
    ['GET', `/projects/${ids.project}/statuses`],
    ['GET', `/projects/${ids.project}/sprints`],
    [
      'POST',
      `/projects/${ids.project}/sprints`,
      { name: 'S1', startDate: '2026-10-05', endDate: '2026-10-16' },
    ],
    ['POST', `/projects/${ids.project}/from-template`, { templateId: 'bug-triage' }],
  ];

  // Order matters below: the admin test deletes the tag and the empty space.
  it('requires a session everywhere', async () => {
    const anon = apiClient(ctx.app);
    for (const [method, path, body] of calls()) {
      const res = await anon(method, path, body);
      expect(res.statusCode, `${method} ${path}`).toBe(401);
    }
  });

  it('answers 404 to someone outside the workspace, for every endpoint', async () => {
    const outsider = as('outsider');
    for (const [method, path, body] of calls()) {
      const res = await outsider(method, path, body);
      expect(res.statusCode, `${method} ${path}`).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
    }
  });

  it('rejects mutations without the web Origin', async () => {
    for (const [method, path, body] of calls().filter(([m]) => m !== 'GET')) {
      const res = await ctx.app.inject({
        method,
        url: `/api/v1${path}`,
        headers: { cookie: cookies.member },
        ...(body ? { payload: body } : {}),
      });
      expect(res.statusCode, `${method} ${path}`).toBe(403);
      expect(errorCode(res)).toBe('CSRF_REJECTED');
    }
  });

  it('lets a plain member do everyday structural edits', async () => {
    const member = as('member');
    const everyday = calls().filter(
      ([method, path]) =>
        !(method === 'DELETE' && (path.startsWith('/spaces') || path.startsWith('/tags'))) &&
        !path.endsWith('/archive') &&
        !path.endsWith('/unarchive') &&
        !path.endsWith('/from-template'),
    );
    for (const [method, path, body] of everyday) {
      const res = await member(method, path, body);
      expect(res.statusCode, `${method} ${path}: ${res.body}`).toBeLessThan(300);
    }
  });

  it('keeps destructive actions to admins and owners', async () => {
    const member = as('member');
    const admin = as('admin');
    const adminOnly: Call[] = [
      ['DELETE', `/spaces/${ids.emptySpace}`],
      ['POST', `/projects/${ids.project}/archive`],
      ['POST', `/projects/${ids.project}/unarchive`],
      ['DELETE', `/tags/${ids.tag}`],
    ];
    for (const [method, path] of adminOnly) {
      const res = await member(method, path);
      expect(res.statusCode, `${method} ${path}`).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
    }
    for (const [method, path] of adminOnly) {
      const res = await admin(method, path);
      expect(res.statusCode, `${method} ${path}`).toBeLessThan(300);
    }
  });

  it('does not accept IDs from another workspace', async () => {
    const member = as('member');

    let res = await member('POST', `/workspaces/${ids.ws}/projects`, {
      spaceId: ids.otherSpace,
      name: 'Sneaky',
    });
    expect(res.statusCode).toBe(404);

    res = await member('POST', `/projects/${ids.project}/move`, { spaceId: ids.otherSpace });
    expect(res.statusCode).toBe(404);

    res = await member('POST', `/projects/${ids.project}/move`, { prevId: ids.otherProject });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('INVALID_MOVE');

    res = await member('PUT', `/projects/${ids.project}/members/${ids.outsider}`);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('USER_NOT_FOUND');
  });
});
