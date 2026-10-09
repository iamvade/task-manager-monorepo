import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './helpers.js';

interface Operation {
  tags?: string[];
  summary?: string;
  security?: unknown[];
  responses?: Record<string, unknown>;
}
interface OpenApiDoc {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
  components: { securitySchemes: Record<string, unknown>; schemas: Record<string, unknown> };
}

describe('OpenAPI docs', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let spec: OpenApiDoc;

  beforeAll(async () => {
    ctx = await createTestApp({ API_DOCS: true });
    const res = await ctx.app.inject({ method: 'GET', url: '/api/docs/json' });
    expect(res.statusCode).toBe(200);
    spec = res.json<OpenApiDoc>();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('serves an OpenAPI 3.1 spec generated from the routes', () => {
    expect(spec.openapi).toMatch(/^3\.1\./);
    expect(spec.components.securitySchemes).toHaveProperty('cookieAuth');
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/auth/login',
        '/api/v1/workspaces/{workspaceId}/sidebar',
        '/api/v1/projects/{projectId}',
        '/api/v1/projects/{projectId}/from-template',
        '/api/v1/projects/{projectId}/tasks',
        '/api/v1/spaces/{spaceId}/tasks',
        '/api/v1/tasks/{taskRef}',
        '/api/v1/tasks/{taskId}/move',
        '/api/v1/workspaces/{workspaceId}/search',
      ]),
    );
    expect(spec.components.schemas).toHaveProperty('ProjectDetail');
    expect(spec.components.schemas).toHaveProperty('TaskDetail');
    expect(spec.components.schemas).toHaveProperty('RichTextNode');
    expect(spec.components.schemas).toHaveProperty('ApiError');
  });

  it('documents every operation with a tag, summary and responses', () => {
    const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, op]) => ({ name: `${method} ${path}`, op })),
    );
    expect(operations.length).toBeGreaterThan(30);
    for (const { name, op } of operations) {
      expect(op.tags?.length, name).toBeGreaterThan(0);
      expect(op.summary, name).toBeTruthy();
      expect(Object.keys(op.responses ?? {}).length, name).toBeGreaterThan(0);
    }
  });

  it('marks public routes as not needing the session cookie', () => {
    expect(spec.paths['/api/v1/auth/login']?.post?.security).toEqual([]);
    expect(spec.paths['/api/v1/health']?.get?.security).toEqual([]);
    expect(spec.paths['/api/v1/auth/me']?.get?.security).toBeUndefined();
  });

  it('serves the Swagger UI', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/api/docs' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
  });

  it('can be turned off', async () => {
    const off = await createTestApp({ API_DOCS: false });
    try {
      const res = await off.app.inject({ method: 'GET', url: '/api/docs/json' });
      expect(res.statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });
});
