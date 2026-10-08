import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runSeed } from '../db/seed.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  await runSeed(db);
} finally {
  await pool.end();
}
