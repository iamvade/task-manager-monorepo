import { sql, type AnyColumn, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { httpError } from '../errors.js';

// Keyset cursor of a newest-first list ordered by (created_at desc, id desc).

const payloadSchema = z.object({ t: z.iso.datetime(), id: z.uuid() });

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.createdAt.toISOString(), id: row.id })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string) {
  try {
    return payloadSchema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw httpError(400, 'INVALID_CURSOR', 'Invalid cursor');
  }
}

/** Rows strictly after the cursor in newest-first order; undefined without a cursor. */
export function afterCursor(
  cursor: string | undefined,
  createdAt: AnyColumn,
  id: AnyColumn,
): SQL | undefined {
  if (!cursor) return undefined;
  const { t, id: lastId } = decodeCursor(cursor);
  return sql`(${createdAt}, ${id}) < (${t}::timestamptz, ${lastId}::uuid)`;
}

/** Splits a `limit + 1` fetch into the page and the cursor of the next one. */
export function page<T extends { createdAt: Date; id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeCursor(last) : null };
}
