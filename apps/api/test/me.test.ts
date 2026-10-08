import { meResponseSchema } from '@kite/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ORIGIN, createUser, login } from './fixtures.js';
import { createTestApp } from './helpers.js';

describe('PATCH /me', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const patch = (cookie: string, payload: object) =>
    ctx.app.inject({
      method: 'PATCH',
      url: '/api/v1/me',
      headers: { origin: ORIGIN, cookie },
      payload,
    });

  it('updates profile and preferences', async () => {
    const user = await createUser(ctx.db);
    const cookie = await login(ctx.app, user.email);
    const res = await patch(cookie, {
      name: 'Temuulen Gan',
      locale: 'en',
      timezone: 'Europe/Berlin',
      theme: 'dark',
      accent: '#0F766E',
      density: 'compact',
    });
    expect(res.statusCode).toBe(200);
    const me = meResponseSchema.parse(res.json());
    expect(me.user).toMatchObject({ name: 'Temuulen Gan', initials: 'TG' });
    expect(me.preferences).toMatchObject({
      locale: 'en',
      timezone: 'Europe/Berlin',
      theme: 'dark',
      accent: '#0F766E',
      density: 'compact',
    });
  });

  it.each([
    [{ timezone: 'Mars/Olympus' }],
    [{ accent: '#123456' }],
    [{ email: 'x@kite.test' }],
    [{}],
  ])('rejects %j', async (payload) => {
    const user = await createUser(ctx.db);
    const res = await patch(await login(ctx.app, user.email), payload);
    expect(res.statusCode).toBe(400);
  });
});
