import { addDays, startOfWeek } from '@kite/shared';
import * as chrono from 'chrono-node';

const MN_WEEKDAYS = ['даваа', 'мягмар', 'лхагва', 'пүрэв', 'баасан', 'бямба', 'ням'];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => `${String(y)}-${pad(m)}-${pad(d)}`;

/** A real calendar date (rejects 02-31 and friends). */
function validDate(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? isoDate(y, m, d) : null;
}

/** Month + day on or after today (this year, else next year). */
function upcoming(today: string, m: number, d: number): string | null {
  const year = Number(today.slice(0, 4));
  const date = validDate(year, m, d);
  if (!date) return null;
  return date >= today ? date : validDate(year + 1, m, d);
}

/** Simple Mongolian phrases: өнөөдөр, маргааш, дараа долоо хоног, (дараа) баасан, … */
function parseMongolian(text: string, today: string): string | null {
  if (text === 'өнөөдөр') return today;
  if (text === 'маргааш') return addDays(today, 1);
  if (text === 'нөгөөдөр') return addDays(today, 2);
  if (/^дараа(гийн)? долоо хоног$/.test(text)) return addDays(startOfWeek(today), 7);
  if (/^(энэ )?амралтын өдөр$/.test(text)) {
    const saturday = addDays(startOfWeek(today), 5);
    return saturday > today ? saturday : addDays(saturday, 7);
  }

  // "3 хоногийн дараа", "5 өдрийн дараа", "2 долоо хоногийн дараа"
  const after = /^(\d{1,3}) (хоног|өдр|долоо хоног)(ийн)? дараа$/.exec(text);
  if (after) {
    const n = Number(after[1]);
    return addDays(today, after[2] === 'долоо хоног' ? n * 7 : n);
  }

  // "баасан", "дараа баасан", "баасан гараг"
  const weekday = /^(дараа(?:гийн)? )?([а-яөү]+)(?: гара?г(?:т)?)?$/.exec(text);
  const index = weekday ? MN_WEEKDAYS.indexOf(weekday[2] ?? '') : -1;
  if (weekday && index >= 0) {
    const monday = startOfWeek(today);
    // Like chrono's "next fri": the weekday of next week.
    if (weekday[1]) return addDays(monday, 7 + index);
    const thisWeek = addDays(monday, index);
    return thisWeek >= today ? thisWeek : addDays(thisWeek, 7);
  }

  // "10-р сарын 14", "10 сарын 14"
  const monthDay = /^(\d{1,2})(?:-р)? сарын (\d{1,2})$/.exec(text);
  if (monthDay) return upcoming(today, Number(monthDay[1]), Number(monthDay[2]));
  return null;
}

/**
 * Due date typed in the quick-create / drawer due picker. Mongolian keywords first, then
 * English natural language via chrono-node ("next fri", "oct 14", "in 3 days"). `today` is
 * today in the user's time zone; dates resolve forward from it. Returns `YYYY-MM-DD` or null.
 */
export function parseDue(input: string, today: string): string | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!text) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const mn = parseMongolian(text, today);
  if (mn) return mn;

  // Match the "Next week" preset (Monday) rather than chrono's +7 days.
  if (text === 'next week') return addDays(startOfWeek(today), 7);

  const [y, m, d] = today.split('-').map(Number);
  // Local noon on the user's today: chrono reads the reference in the browser's zone.
  const ref = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
  const parsed = chrono.en.casual.parseDate(text, ref, { forwardDate: true });
  if (!parsed) return null;
  return isoDate(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
}
