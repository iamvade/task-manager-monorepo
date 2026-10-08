import { sql } from 'drizzle-orm';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { runSeed } from '../db/seed/index.js';
import { seedOptionsFromEnv } from './seed-env.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  console.error('Refusing to reset the database when NODE_ENV=production.');
  process.exit(1);
}

const seedOptions = seedOptionsFromEnv();
const { db, pool } = createDb(config.DATABASE_URL);
try {
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  console.log('Database dropped.');
  const applied = await runMigrations(db);
  console.log(applied ? 'Migrations applied.' : 'No migrations found (run pnpm db:generate).');
  await runSeed(db, seedOptions);
} finally {
  await pool.end();
}
