import { sql } from 'drizzle-orm';
import type { Db } from './client.js';
import { runMigrations } from './migrate.js';
import { runSeed, type SeedOptions } from './seed/index.js';

/** Drops every table, applies the migrations and inserts the sample data. */
export async function resetDatabase(db: Db, seedOptions: SeedOptions): Promise<void> {
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  console.log('Database dropped.');
  const applied = await runMigrations(db);
  console.log(applied ? 'Migrations applied.' : 'No migrations found (run pnpm db:generate).');
  await runSeed(db, seedOptions);
}
