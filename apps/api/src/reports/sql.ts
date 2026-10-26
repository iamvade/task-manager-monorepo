import { CLOSED_CATEGORIES, SIZE_POINTS, SIZES, WAIT_CATEGORIES } from '@kite/shared';
import { sql, type SQL } from 'drizzle-orm';
import type { DbOrTx } from '../db/client.js';

/**
 * SQL fragments shared by the report queries. Queries are raw SQL so they can use CTEs, FILTER
 * and percentile_cont. Raw results skip drizzle's column mapping, so queries return dates as
 * `text`, instants via `isoTs` and numbers as int/float8 (not numeric strings).
 */

/** A table alias inside a fragment. Only ever called with literals from this module. */
export const alias = (name: string) => sql.raw(name);

/** Points of a task row's size (S 1 · M 3 · L 5 · XL 8; unsized 0). */
export const sizePoints = (t: string) =>
  sql.raw(
    `(case ${t}.size ${SIZES.map((s) => `when '${s}' then ${SIZE_POINTS[s]}`).join(' ')} else 0 end)`,
  );

/** A timestamptz as an ISO 8601 UTC string (`2026-10-08T01:00:00.000Z`). */
export const isoTs = (ts: SQL) =>
  sql`to_char((${ts}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Midnight at the start of a local `YYYY-MM-DD` day, as a timestamptz. */
export const dayStart = (date: string, timezone: string) =>
  sql`(${date}::date::timestamp at time zone ${timezone})`;

/** `ts` as a local date in `timezone`. */
export const localDate = (ts: SQL, timezone: string) => sql`(${ts} at time zone ${timezone})::date`;

/** Days between two timestamptz expressions, as float8. */
export const daysBetweenTs = (from: SQL, to: SQL) =>
  sql`(extract(epoch from (${to}) - (${from})) / 86400.0)`;

/** Median of a float expression, rounded to 1 decimal (null for no rows). */
export const median1 = (expr: SQL, filter?: SQL) =>
  sql`round((percentile_cont(0.5) within group (order by ${expr}) ${filter ? sql`filter (where ${filter})` : sql``})::numeric, 1)::float8`;

/** 85th percentile of a float expression, rounded to 1 decimal. */
export const p85 = (expr: SQL, filter?: SQL) =>
  sql`round((percentile_cont(0.85) within group (order by ${expr}) ${filter ? sql`filter (where ${filter})` : sql``})::numeric, 1)::float8`;

/**
 * When a task's cycle started: its first In Progress or In Review period, else its creation.
 * Uses `task_status_periods (task_id, entered_at)`.
 */
export const cycleStart = (t: string) => {
  const a = alias(t);
  return sql`coalesce((
    select min(csp.entered_at) from task_status_periods csp
    where csp.task_id = ${a}.id and csp.category in ('in_progress', 'review')
  ), ${a}.created_at)`;
};

/** Cycle time in days of a completed task row. */
export const cycleDays = (t: string) => daysBetweenTs(cycleStart(t), sql`${alias(t)}.completed_at`);

/** Whether the task was in a done status at instant `at` (from its status periods). */
export const doneAt = (t: string, at: SQL) => sql`exists (
  select 1 from task_status_periods dsp
  where dsp.task_id = ${alias(t)}.id and dsp.category = 'done'
    and dsp.entered_at <= ${at} and (dsp.exited_at is null or dsp.exited_at > ${at})
)`;

/** Whether the task was in a closed (done or cancelled) status at instant `at`. */
export const closedAt = (t: string, at: SQL) => sql`exists (
  select 1 from task_status_periods csp
  where csp.task_id = ${alias(t)}.id and csp.category in (${categoryList(CLOSED_CATEGORIES)})
    and csp.entered_at <= ${at} and (csp.exited_at is null or csp.exited_at > ${at})
)`;

/** `'todo', 'in_progress', …` for an `in (…)` list; the values are enum constants. */
export const categoryList = (categories: readonly string[]) =>
  sql.raw(categories.map((c) => `'${c}'`).join(', '));

/** The categories where work waits on someone (Where work waits, Aging, burndown insight). */
export const waitCategoriesSql = categoryList(WAIT_CATEGORIES);

/**
 * A text array as one bound parameter (drizzle would expand a JS array into a row); cast it at
 * the use site, e.g. `${textArray(ids)}::uuid[]`. Elements are quoted, so any text is safe.
 */
export const textArray = (values: readonly string[]) =>
  sql`${`{${values.map((v) => `"${v.replace(/["\\]/g, '\\$&')}"`).join(',')}}`}`;

/** Runs a raw query and returns its rows, typed by the caller (the SQL defines the shape). */
export async function rows<T extends Record<string, unknown>>(
  db: DbOrTx,
  query: SQL,
): Promise<T[]> {
  const result = await db.execute(query);
  return result.rows as T[];
}
