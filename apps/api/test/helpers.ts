import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';

/** Builds the app against the test database. Call `close()` in afterAll. */
export async function createTestApp() {
  const config = loadConfig();
  if (!config.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set to run API tests.');
  }
  const { db, pool } = createDb(config.TEST_DATABASE_URL);
  const app = await buildApp(config, db);
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
