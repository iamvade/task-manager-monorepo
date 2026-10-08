import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Db } from './client.js';

const migrationsFolder = resolve(process.cwd(), 'drizzle');

/** Applies pending drizzle-kit migrations. Returns false when none have been generated yet. */
export async function runMigrations(db: Db): Promise<boolean> {
  if (!existsSync(resolve(migrationsFolder, 'meta/_journal.json'))) {
    return false;
  }
  await migrate(db, { migrationsFolder });
  return true;
}
