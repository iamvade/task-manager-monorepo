import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** UUIDv7 primary key (time-sortable), generated in the app. */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** `timestamptz` read and written as `Date`. */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const createdAt = () => timestamptz('created_at').notNull().defaultNow();

/** Case-insensitive text (needs the `citext` extension, see drizzle/0000_extensions.sql). */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
});

/**
 * Fractional-index ordering key (`fractional-indexing` package). Keys must compare byte-wise,
 * so the column uses the "C" collation instead of the database default.
 */
export const position = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});
