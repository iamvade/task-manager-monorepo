import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';

/** Brings the test database schema up to date once before the suite runs. */
export default async function setup(): Promise<void> {
  const config = loadConfig();
  if (!config.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set to run API tests.');
  }
  const { db, pool } = createDb(config.TEST_DATABASE_URL);
  try {
    await runMigrations(db);
  } finally {
    await pool.end();
  }
}
