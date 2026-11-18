import { addDays } from './dates.js';
import type { OutlookBusyBlock } from './schemas/outlook.js';

/** An instant as wall-clock date (`YYYY-MM-DD`) and time (`HH:mm`) in `timeZone`. */
export function instantInZone(iso: string, timeZone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** Where an event sits on a calendar in the viewer's zone. */
export interface PlacedBlock {
  /** Every day it covers (at least one). */
  days: string[];
  /** Local `HH:mm` of the start and end; null for all-day events. */
  startTime: string | null;
  endTime: string | null;
}

/** The longest an event may span on the grid (a runaway event would fill every cell). */
const MAX_SPAN_DAYS = 62;

/**
 * The days an event covers in `timeZone` (the one place Outlook events meet the viewer's zone).
 * All-day events use their dates as written (end exclusive); a timed event ending exactly at
 * midnight doesn't reach the next day.
 */
export function placeBlock(block: OutlookBusyBlock, timeZone: string): PlacedBlock {
  let first: string;
  let last: string;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (block.allDay) {
    first = block.start;
    last = block.end > block.start ? addDays(block.end, -1) : block.start;
  } else {
    const start = instantInZone(block.start, timeZone);
    const end = instantInZone(block.end, timeZone);
    first = start.date;
    startTime = start.time;
    endTime = end.time;
    last = end.time === '00:00' && end.date > start.date ? addDays(end.date, -1) : end.date;
    if (last < first) last = first;
  }
  const days: string[] = [];
  for (let d = first; d <= last && days.length < MAX_SPAN_DAYS; d = addDays(d, 1)) days.push(d);
  return { days, startTime, endTime };
}

/** Busy blocks and events sort all-day first, then by start. */
export function compareBlocks(a: OutlookBusyBlock, b: OutlookBusyBlock): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
}
