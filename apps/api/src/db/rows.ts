/** The single row from an insert/update `.returning()` (or a lookup that must hit). */
export function one<T>(rows: T[], what = 'row'): T {
  const [row] = rows;
  if (row === undefined) throw new Error(`Expected one ${what}, got none`);
  return row;
}
