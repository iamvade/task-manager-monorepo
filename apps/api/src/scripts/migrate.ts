import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';

const config = loadConfig();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  const applied = await runMigrations(db);
  console.log(applied ? 'Migrations applied.' : 'No migrations found (run pnpm db:generate).');
} finally {
  await pool.end();
}
