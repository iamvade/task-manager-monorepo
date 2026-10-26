import { formatTaskKey, todayInZone } from '@kite/shared';

// @kite/shared is imported as TS source (`.js` sibling specifiers) and uses Intl time zones.
describe('@kite/shared', () => {
  it('formats task keys', () => {
    expect(formatTaskKey('APP', 142)).toBe('APP-142');
  });

  it('computes today in a zone', () => {
    const at = new Date('2026-10-08T17:30:00Z');
    expect(todayInZone('Asia/Ulaanbaatar', at)).toBe('2026-10-09');
    expect(todayInZone('America/New_York', at)).toBe('2026-10-08');
    // DST: 04:30 UTC on Nov 1 2026 is 00:30 EDT (still Nov 1), and on Nov 2 23:30 EST is Nov 1.
    expect(todayInZone('America/New_York', new Date('2026-11-01T04:30:00Z'))).toBe('2026-11-01');
    expect(todayInZone('America/New_York', new Date('2026-11-02T04:30:00Z'))).toBe('2026-11-01');
  });
});
