/** Postgres `unique_violation`, optionally for one named constraint. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  // drizzle wraps driver errors; the pg error is the `cause`.
  for (let e: unknown = err; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const { code, constraint: name } = e as { code?: unknown; constraint?: unknown };
    if (code === '23505') return constraint === undefined || name === constraint;
  }
  return false;
}
