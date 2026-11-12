import { buildApp, type AppOptions } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { createDb } from '../src/db/client.js';

/** Builds the app against the test database. Call `close()` in afterAll. */
export async function createTestApp(overrides: Partial<Config> = {}, options: AppOptions = {}) {
  // The connector's OAuth routes are on in tests so the route sweep and docs test cover them.
  const config = { ...loadConfig(), CONNECTOR_ENABLED: true, ...overrides };
  if (!config.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set to run API tests.');
  }
  const { db, pool } = createDb(config.TEST_DATABASE_URL);
  const app = await buildApp(config, db, options);
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await pool.end();
    },
  };
}
