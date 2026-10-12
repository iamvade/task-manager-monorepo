import { sql } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { apiErrorSchema, healthResponseSchema } from '@kite/shared';

export const healthRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/health',
    {
      // Generous enough for load balancers and uptime checks; each call queries the database.
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      // Container healthchecks poll this every few seconds; only problems are worth a log line.
      logLevel: 'warn',
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Reports API and database status; 503 when the database is down.',
        security: [],
        response: { 200: healthResponseSchema, 429: apiErrorSchema, 503: healthResponseSchema },
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
