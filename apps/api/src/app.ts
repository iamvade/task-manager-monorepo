import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { registerAuth } from './auth/plugin.js';
import { docsEnabled, type Config } from './config.js';
import type { Db } from './db/client.js';
import { registerDocs } from './docs.js';
import { registerErrorHandlers } from './errors.js';
import { EventBus } from './events/bus.js';
import { authRoutes } from './routes/auth.js';
import { healthRoutes } from './routes/health.js';
import { inviteRoutes } from './routes/invites.js';
import { meRoutes } from './routes/me.js';
import { projectMemberRoutes } from './routes/project-members.js';
import { projectRoutes } from './routes/projects.js';
import { searchRoutes } from './routes/search.js';
import { spaceRoutes } from './routes/spaces.js';
import { sprintRoutes } from './routes/sprints.js';
import { statusRoutes } from './routes/statuses.js';
import { tagRoutes } from './routes/tags.js';
import { taskRoutes } from './routes/tasks.js';
import { templateRoutes } from './routes/templates.js';
import { workspaceRoutes } from './routes/workspaces.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    /** Domain events, emitted after commit. */
    events: EventBus;
  }
}

function loggerOptions(config: Config): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'test') return false;
  if (config.NODE_ENV === 'development') {
    return {
      level: config.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
    };
  }
  return { level: config.LOG_LEVEL };
}

export async function buildApp(config: Config, db: Db) {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('events', new EventBus(app.log));
  registerErrorHandlers(app);

  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  registerAuth(app);
  if (docsEnabled(config)) await registerDocs(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(meRoutes);
      await api.register(inviteRoutes);
      await api.register(workspaceRoutes);
      await api.register(spaceRoutes);
      await api.register(projectRoutes);
      await api.register(projectMemberRoutes);
      await api.register(tagRoutes);
      await api.register(statusRoutes);
      await api.register(sprintRoutes);
      await api.register(templateRoutes);
      await api.register(taskRoutes);
      await api.register(searchRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
