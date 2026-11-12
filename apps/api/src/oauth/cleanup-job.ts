import type { FastifyInstance } from 'fastify';
import { removeExpiredOAuthRows } from './service.js';

const HOUR_MS = 3_600_000;

/** Hourly, in-process. Off in tests, which call `removeExpiredOAuthRows` directly. */
export function scheduleOAuthCleanup(app: FastifyInstance): void {
  if (app.config.NODE_ENV === 'test') return;
  let timer: NodeJS.Timeout | undefined;
  const run = async () => {
    try {
      await removeExpiredOAuthRows(app.db, new Date());
    } catch (err) {
      app.log.error({ err }, 'OAuth cleanup failed');
    }
  };
  app.addHook('onReady', () => {
    void run();
    timer = setInterval(() => void run(), HOUR_MS);
    timer.unref();
  });
  app.addHook('onClose', () => {
    clearInterval(timer);
  });
}
