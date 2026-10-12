import { buildApp } from './app.js';
import { loadConfig, secureCookies } from './config.js';
import { createDb } from './db/client.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
const app = await buildApp(config, db);
if (config.NODE_ENV === 'production' && !secureCookies(config)) {
  app.log.warn(
    `WEB_ORIGIN is ${config.WEB_ORIGIN}: session cookies are not Secure. Serve the app over https.`,
  );
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await pool.end();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (err) {
  app.log.error(err);
  await pool.end();
  process.exit(1);
}
