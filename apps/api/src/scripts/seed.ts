import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runSeed } from '../db/seed/index.js';
import { seedOptionsFromEnv } from './seed-env.js';

const config = loadConfig();
const options = seedOptionsFromEnv();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  await runSeed(db, options);
} finally {
  await pool.end();
}
