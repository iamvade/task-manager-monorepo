import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
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
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { commentRoutes } from './routes/comments.js';
import { healthRoutes } from './routes/health.js';
import { inviteRoutes } from './routes/invites.js';
import { meRoutes } from './routes/me.js';
import { projectMemberRoutes } from './routes/project-members.js';
import { projectRoutes } from './routes/projects.js';
import { searchRoutes } from './routes/search.js';
import { spaceRoutes } from './routes/spaces.js';
import { sprintRoutes } from './routes/sprints.js';
import { statusRoutes } from './routes/statuses.js';
import { subtaskRoutes } from './routes/subtasks.js';
import { tagRoutes } from './routes/tags.js';
import { taskActivityRoutes } from './routes/task-activity.js';
import { taskRoutes } from './routes/tasks.js';
import { templateRoutes } from './routes/templates.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { LocalDiskStorage } from './storage/local.js';
import type { Storage } from './storage/storage.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    /** Domain events, emitted after commit. */
    events: EventBus;
    /** Attachment files. */
    storage: Storage;
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

export interface AppOptions {
  /** Defaults to local disk under `UPLOADS_DIR`. */
  storage?: Storage;
}

export async function buildApp(config: Config, db: Db, options: AppOptions = {}) {
  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('events', new EventBus(app.log));
  app.decorate('storage', options.storage ?? new LocalDiskStorage(config.UPLOADS_DIR));
  registerErrorHandlers(app);

  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  await app.register(cookie, { secret: config.COOKIE_SECRET });
  // Size limits are checked by the upload route (413 with our error body), not thrown here.
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 10, parts: 11 },
  });
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
      await api.register(subtaskRoutes);
      await api.register(commentRoutes);
      await api.register(attachmentRoutes);
      await api.register(taskActivityRoutes);
      await api.register(searchRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
