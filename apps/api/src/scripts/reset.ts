import { parseArgs } from 'node:util';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { recreateSchema, resetDatabase } from '../db/reset.js';
import { runBlankSeed } from '../db/seed/blank.js';
import { seedOptionsFromEnv } from './seed-env.js';

// Default: one owner in an empty workspace (`db/seed/blank.ts`). `--demo`: the sample data.
const { values } = parseArgs({ options: { demo: { type: 'boolean' } }, strict: true });

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to reset the database when NODE_ENV=production.');
  process.exit(1);
}

const seedOptions = values.demo ? seedOptionsFromEnv() : undefined;
const { db, pool } = createDb(config.DATABASE_URL);
try {
  if (seedOptions) {
    await resetDatabase(db, seedOptions);
  } else {
    await recreateSchema(db);
    await runBlankSeed(db);
  }
} finally {
  await pool.end();
}
