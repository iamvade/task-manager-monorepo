import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from '@kite/shared';
import { createTestApp } from './helpers.js';

describe('GET /api/v1/health', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('reports the database as up', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    const body = healthResponseSchema.parse(res.json());
    expect(body).toMatchObject({ status: 'ok', db: 'up' });
  });

  it('answers unknown routes with the error envelope', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(apiErrorSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  });
});
