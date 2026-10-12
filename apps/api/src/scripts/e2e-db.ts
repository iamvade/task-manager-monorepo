import pg from 'pg';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { resetDatabase } from '../db/reset.js';
import { seedOptionsFromEnv } from './seed-env.js';

/**
 * Playwright's database (`pnpm e2e`): creates the `DATABASE_URL` database when it is missing,
 * then drops, migrates and seeds it. Only runs against a database whose name ends in `_e2e`, so
 * it can never wipe the dev database.
 */
const config = loadConfig();
const url = new URL(config.DATABASE_URL);
const name = decodeURIComponent(url.pathname.slice(1));
if (config.NODE_ENV === 'production' || !name.endsWith('_e2e')) {
  console.error(`Refusing to reset "${name}": the e2e database name must end in _e2e.`);
  process.exit(1);
}

const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
try {
  const found = await admin.query('select 1 from pg_database where datname = $1', [name]);
  if (found.rowCount === 0) {
    await admin.query(`create database "${name.replaceAll('"', '""')}"`);
    console.log(`Created database ${name}.`);
  }
} finally {
  await admin.end();
}

const { db, pool } = createDb(config.DATABASE_URL);
try {
  await resetDatabase(db, seedOptionsFromEnv());
} finally {
  await pool.end();
}
