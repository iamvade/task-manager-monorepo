import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** For helpers that run either standalone or inside a caller's transaction. */
export type DbOrTx = Db | Tx;

export interface DbHandle {
  db: Db;
  pool: pg.Pool;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5_000 });
  // Idle clients can error when the server restarts; log instead of crashing the process.
  pool.on('error', (err) => {
    console.error('Postgres pool error:', err.message);
  });
  return { db: drizzle(pool, { schema }), pool };
}
