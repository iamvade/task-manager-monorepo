import type { Locale } from '@kite/shared';
import { format, parseISO } from 'date-fns';

/** Week start on a chart axis: "Jul 20" / "7/20" (design-notes A.4). */
export function weekLabel(date: string, locale: Locale): string {
  if (locale === 'en') return format(parseISO(date), 'MMM d');
  const [, m = 1, d = 1] = date.split('-').map(Number);
  return `${String(m)}/${String(d)}`;
}

/** Days to one decimal ("4.6"); "—" when there is no value. */
export const formatDays = (days: number | null): string => (days === null ? '—' : days.toFixed(1));

/**
 * Mongolian ablative ("from") suffix after a numeral, by how the number is read aloud:
 * 142 → "142-оос" (хоёр), 5 → "5-аас" (тав), 1 → "1-ээс" (нэг), 20 → "20-иос" (хорь).
 */
export function mnFrom(n: number): string {
  const abs = Math.abs(Math.trunc(n));
  return `${String(n)}-${mnAblativeSuffix(abs)}`;
}

const ONES = ['', 'ээс', 'оос', 'аас', 'өөс', 'аас', 'гаас', 'гоос', 'аас', 'өөс'];
const TENS = ['', 'аас', 'иос', 'аас', 'өөс', 'иас', 'аас', 'аас', 'гаас', 'өөс'];

function mnAblativeSuffix(n: number): string {
  if (n === 0) return 'ээс'; // тэг
  const ones = n % 10;
  if (ones) return ONES[ones] ?? 'аас';
  const tens = Math.floor(n / 10) % 10;
  if (tens) return TENS[tens] ?? 'аас';
  // зуу, мянга, сая… all take -гаас.
  return n % 1_000_000 === 0 && n >= 1_000_000 ? 'аас' : 'гаас';
}
