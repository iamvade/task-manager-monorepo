import { describe, expect, it } from 'vitest';
import { compareBlocks, placeBlock } from './outlook.js';

const UB = 'Asia/Ulaanbaatar';

describe('placeBlock', () => {
  it('keeps all-day dates as written, end exclusive', () => {
    expect(
      placeBlock({ allDay: true, start: '2026-11-18', end: '2026-11-21', showAs: 'oof' }, UB),
    ).toEqual({ days: ['2026-11-18', '2026-11-19', '2026-11-20'], startTime: null, endTime: null });
  });

  it('places a timed event on its local days', () => {
    // 15:00Z–17:00Z is 23:00–01:00 in Ulaanbaatar: two days.
    expect(
      placeBlock(
        {
          allDay: false,
          start: '2026-11-19T15:00:00.000Z',
          end: '2026-11-19T17:00:00.000Z',
          showAs: 'busy',
        },
        UB,
      ),
    ).toEqual({ days: ['2026-11-19', '2026-11-20'], startTime: '23:00', endTime: '01:00' });
  });

  it('does not reach the next day when ending at midnight', () => {
    const placed = placeBlock(
      {
        allDay: false,
        start: '2026-11-19T14:00:00.000Z',
        end: '2026-11-19T16:00:00.000Z',
        showAs: 'busy',
      },
      UB,
    );
    expect(placed.days).toEqual(['2026-11-19']);
    expect(placed.endTime).toBe('00:00');
  });

  it('uses the viewer zone', () => {
    const block = {
      allDay: false,
      start: '2026-11-19T02:00:00.000Z',
      end: '2026-11-19T03:00:00.000Z',
      showAs: 'busy' as const,
    };
    expect(placeBlock(block, 'America/Los_Angeles').days).toEqual(['2026-11-18']);
    expect(placeBlock(block, UB).startTime).toBe('10:00');
  });
});

describe('compareBlocks', () => {
  it('puts all-day first, then by start', () => {
    const a = {
      allDay: false,
      start: '2026-11-19T01:00:00.000Z',
      end: '',
      showAs: 'busy' as const,
    };
    const b = { allDay: true, start: '2026-11-19', end: '2026-11-20', showAs: 'busy' as const };
    const c = {
      allDay: false,
      start: '2026-11-19T00:00:00.000Z',
      end: '',
      showAs: 'busy' as const,
    };
    expect([a, b, c].sort(compareBlocks)).toEqual([b, c, a]);
  });
});
