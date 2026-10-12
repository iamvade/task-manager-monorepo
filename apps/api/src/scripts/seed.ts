import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runSeed } from '../db/seed/index.js';
import { seedOptionsFromEnv } from './seed-env.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  // The seed creates demo accounts with a shared, published password.
  console.error('Refusing to seed demo data when NODE_ENV=production.');
  process.exit(1);
}
const options = seedOptionsFromEnv();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  await runSeed(db, options);
} finally {
  await pool.end();
}
