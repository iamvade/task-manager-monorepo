import { sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@kite/shared';

export const healthRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Reports API and database status; 503 when the database is down.',
        security: [],
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
    },
    async (request, reply) => {
      const time = new Date().toISOString();
      try {
        await app.db.execute(sql`select 1`);
        return { status: 'ok' as const, db: 'up' as const, time };
      } catch (err) {
        request.log.warn({ err }, 'health check: database unreachable');
        return reply.code(503).send({ status: 'degraded', db: 'down', time });
      }
    },
  );
  done();
};
