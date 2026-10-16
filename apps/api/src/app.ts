import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
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
import { loggerOptions } from './logging.js';
import { scheduleArchiveJob } from './notifications/archive-job.js';
import { scheduleStandupNotices } from './standups/notices-job.js';
import { registerNotifier } from './notifications/notifier.js';
import { registerRealtime } from './realtime/plugin.js';
import { ReportCache } from './reports/cache.js';
import { attachmentRoutes } from './routes/attachments.js';
import { authRoutes } from './routes/auth.js';
import { commentRoutes } from './routes/comments.js';
import { healthRoutes } from './routes/health.js';
import { homeRoutes } from './routes/home.js';
import { inviteRoutes } from './routes/invites.js';
import { meRoutes } from './routes/me.js';
import { notificationRoutes } from './routes/notifications.js';
import { projectMemberRoutes } from './routes/project-members.js';
import { projectRoutes } from './routes/projects.js';
import { realtimeRoutes } from './routes/realtime.js';
import { reportRoutes } from './routes/reports.js';
import { searchRoutes } from './routes/search.js';
import { spaceRoutes } from './routes/spaces.js';
import { sprintRoutes } from './routes/sprints.js';
import { statusRoutes } from './routes/statuses.js';
import { subtaskRoutes } from './routes/subtasks.js';
import { absenceRoutes } from './routes/absences.js';
import { standupEntryRoutes } from './routes/standup-entries.js';
import { standupMeetingRoutes } from './routes/standup-meetings.js';
import { standupGroupRoutes } from './routes/standup-groups.js';
import { tagRoutes } from './routes/tags.js';
import { taskActivityRoutes } from './routes/task-activity.js';
import { taskRoutes } from './routes/tasks.js';
import { templateRoutes } from './routes/templates.js';
import { offboardingRoutes } from './routes/offboarding.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { createStorage } from './storage/index.js';
import type { Storage } from './storage/storage.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    db: Db;
    /** Domain events, emitted after commit. */
    events: EventBus;
    /** Attachment files. */
    storage: Storage;
    /** Current time; tests pin it. */
    clock: () => Date;
    /** Computed reports, cleared per workspace by task events. */
    reportCache: ReportCache;
  }
}

export interface AppOptions {
  /** Defaults to the `STORAGE_DRIVER` store (local disk under `UPLOADS_DIR`, or S3). */
  storage?: Storage;
  /** Defaults to the system clock. */
  now?: () => Date;
  /** Send logs here (tests read them back); otherwise per `NODE_ENV`. */
  logStream?: NodeJS.WritableStream;
}

export async function buildApp(config: Config, db: Db, options: AppOptions = {}) {
  const app = Fastify({
    logger: loggerOptions(config, options.logStream),
    // A hop count trusts that many proxies nearest to us (proxy-addr semantics).
    trustProxy:
      typeof config.TRUST_PROXY === 'number'
        ? (_address: string, hop: number) => hop < (config.TRUST_PROXY as number)
        : config.TRUST_PROXY,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorate('config', config);
  app.decorate('db', db);
  app.decorate('events', new EventBus(app.log));
  app.decorate('storage', options.storage ?? (await createStorage(config)));
  app.decorate('clock', options.now ?? (() => new Date()));
  app.decorate('reportCache', new ReportCache(config.REPORTS_CACHE_TTL_MS, () => app.clock()));
  app.events.on('*', (event) => {
    app.reportCache.invalidate(event.workspaceId);
  });
  registerErrorHandlers(app);

  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  // Session cookies are random tokens checked against the database, so no signing secret.
  await app.register(cookie);
  // Size limits are checked by the upload route (413 with our error body), not thrown here.
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 10, parts: 11 },
  });
  registerAuth(app);
  await registerRealtime(app);
  registerNotifier(app);
  scheduleArchiveJob(app);
  scheduleStandupNotices(app);
  if (docsEnabled(config)) await registerDocs(app);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(meRoutes);
      await api.register(inviteRoutes);
      await api.register(workspaceRoutes);
      await api.register(offboardingRoutes);
      await api.register(spaceRoutes);
      await api.register(projectRoutes);
      await api.register(projectMemberRoutes);
      await api.register(tagRoutes);
      await api.register(absenceRoutes);
      await api.register(standupGroupRoutes);
      await api.register(standupEntryRoutes);
      await api.register(standupMeetingRoutes);
      await api.register(statusRoutes);
      await api.register(sprintRoutes);
      await api.register(templateRoutes);
      await api.register(taskRoutes);
      await api.register(subtaskRoutes);
      await api.register(commentRoutes);
      await api.register(attachmentRoutes);
      await api.register(taskActivityRoutes);
      await api.register(searchRoutes);
      await api.register(notificationRoutes);
      await api.register(homeRoutes);
      await api.register(reportRoutes);
      await api.register(realtimeRoutes);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
