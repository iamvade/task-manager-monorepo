import { describe, expect, it } from 'vitest';
import { expandEvents, parseCalendar } from '../src/outlook/ics.js';
import { OUTLOOK_FEED } from './outlook-feed.js';

const range = (from: string, to: string) => ({ from: new Date(from), to: new Date(to) });

function events(from: string, to: string) {
  const root = parseCalendar(OUTLOOK_FEED);
  if (!root) throw new Error('fixture did not parse');
  return expandEvents(root, range(from, to));
}

describe('Outlook ICS parsing', () => {
  it('rejects text that is not a calendar', () => {
    expect(parseCalendar('<html>Sign in</html>')).toBeNull();
    expect(parseCalendar('BEGIN:VCARD\r\nEND:VCARD\r\n')).toBeNull();
  });

  it('expands a weekly series with a deleted and a moved occurrence', () => {
    const weekly = events('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z').filter((e) =>
      e.id.startsWith('weekly-1|'),
    );
    expect(weekly.map((e) => [e.title, e.start])).toEqual([
      ['Weekly sync', '2026-11-02T02:00:00.000Z'],
      ['Weekly sync', '2026-11-09T02:00:00.000Z'],
      // Nov 16 deleted; Nov 23 moved to Tuesday 14:00 local.
      ['Weekly sync (moved)', '2026-11-24T06:00:00.000Z'],
      ['Weekly sync', '2026-11-30T02:00:00.000Z'],
    ]);
    expect(weekly[0]).toMatchObject({
      end: '2026-11-02T02:30:00.000Z',
      location: 'Room 3',
      allDay: false,
      showAs: 'busy',
    });
  });

  it('keeps wall time across a daylight-saving change', () => {
    const calls = events('2026-10-29T00:00:00Z', '2026-11-05T00:00:00Z').filter(
      (e) => e.title === 'US call',
    );
    expect(calls.map((e) => e.start)).toEqual([
      '2026-10-30T16:00:00.000Z',
      '2026-10-31T16:00:00.000Z',
      '2026-11-01T17:00:00.000Z',
      '2026-11-02T17:00:00.000Z',
    ]);
    expect(calls[0]?.showAs).toBe('tentative');
  });

  it('keeps all-day dates as written, end exclusive', () => {
    const conf = events('2026-11-17T00:00:00Z', '2026-11-22T00:00:00Z').find(
      (e) => e.title === 'Conference',
    );
    expect(conf).toMatchObject({
      allDay: true,
      start: '2026-11-18',
      end: '2026-11-21',
      showAs: 'oof',
    });
  });

  it('places an event past midnight by its instants', () => {
    const late = events('2026-11-19T00:00:00Z', '2026-11-21T00:00:00Z').find(
      (e) => e.title === 'Release night',
    );
    expect(late).toMatchObject({
      start: '2026-11-19T15:00:00.000Z',
      end: '2026-11-19T17:00:00.000Z',
      showAs: 'busy',
    });
  });

  it('leaves out cancelled events and marks transparent ones free', () => {
    const day = events('2026-11-17T16:00:00Z', '2026-11-18T16:00:00Z');
    expect(day.some((e) => e.title.includes('Lunch'))).toBe(false);
    expect(day.find((e) => e.title === 'Focus reminder')?.showAs).toBe('free');
  });

  it('only returns occurrences that overlap the range, all-day first', () => {
    const list = events('2026-11-18T00:00:00Z', '2026-11-19T00:00:00Z');
    expect(list[0]?.allDay).toBe(true);
    expect(list.every((e) => e.allDay || (e.start < '2026-11-19' && e.end > '2026-11-18'))).toBe(
      true,
    );
    expect(list.some((e) => e.title === 'Weekly sync')).toBe(false);
  });

  it('restores the global zone registry after parsing', async () => {
    const ICAL = (await import('ical.js')).default;
    events('2026-11-01T00:00:00Z', '2026-11-02T00:00:00Z');
    expect(ICAL.TimezoneService.has('Ulaanbaatar Standard Time')).toBe(false);
  });
});
