import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { resetDatabase } from '../db/reset.js';
import { seedOptionsFromEnv } from './seed-env.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to reset the database when NODE_ENV=production.');
  process.exit(1);
}

const seedOptions = seedOptionsFromEnv();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  await resetDatabase(db, seedOptions);
} finally {
  await pool.end();
}
