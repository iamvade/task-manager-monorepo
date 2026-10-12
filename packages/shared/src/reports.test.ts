import { describe, expect, it } from 'vitest';
import { reportRange, sprintPace, workloadLoad } from './reports.js';
import { personReportQuerySchema, reportQuerySchema } from './schemas/reports.js';

describe('reportRange', () => {
  it('4w is the 28 days ending today, compared with the 28 before', () => {
    // Reports.dc.html: "Sep 12 – Oct 9 · compared with the previous 4 weeks (Aug 15 – Sep 11)".
    expect(reportRange('4w', '2026-10-09')).toEqual({
      range: { from: '2026-09-12', to: '2026-10-09' },
      previousRange: { from: '2026-08-15', to: '2026-09-11' },
    });
  });

  it('week starts on Monday and compares with the same number of days before', () => {
    expect(reportRange('week', '2026-10-09')).toEqual({
      range: { from: '2026-10-05', to: '2026-10-09' },
      previousRange: { from: '2026-09-30', to: '2026-10-04' },
    });
    // On a Monday the week is just today.
    expect(reportRange('week', '2026-10-12').range).toEqual({
      from: '2026-10-12',
      to: '2026-10-12',
    });
    // Sunday still belongs to the week that started on Monday.
    expect(reportRange('week', '2026-10-11').range.from).toBe('2026-10-05');
  });

  it('quarter runs from the first day of the calendar quarter', () => {
    expect(reportRange('quarter', '2026-10-09')).toEqual({
      range: { from: '2026-10-01', to: '2026-10-09' },
      previousRange: { from: '2026-09-22', to: '2026-09-30' },
    });
    expect(reportRange('quarter', '2026-03-31').range.from).toBe('2026-01-01');
  });

  it('custom uses from–to', () => {
    expect(reportRange('custom', '2026-10-09', { from: '2026-09-01', to: '2026-09-10' })).toEqual({
      range: { from: '2026-09-01', to: '2026-09-10' },
      previousRange: { from: '2026-08-22', to: '2026-08-31' },
    });
  });
});

describe('workloadLoad', () => {
  it('capacity 15: Heavy above 18 points, Light at 7 or less', () => {
    expect(workloadLoad(19, 0, 15)).toBe('heavy');
    expect(workloadLoad(18, 0, 15)).toBe('balanced');
    expect(workloadLoad(8, 0, 15)).toBe('balanced');
    expect(workloadLoad(7, 0, 15)).toBe('light');
    expect(workloadLoad(0, 0, 15)).toBe('light');
  });

  it('5 overdue points make anyone Heavy', () => {
    expect(workloadLoad(5, 5, 15)).toBe('heavy');
    expect(workloadLoad(5, 4, 15)).toBe('light');
    expect(workloadLoad(10, 4, 15)).toBe('balanced');
  });

  it('scales with the capacity', () => {
    expect(workloadLoad(13, 0, 10)).toBe('heavy');
    expect(workloadLoad(12, 0, 10)).toBe('balanced');
    expect(workloadLoad(6, 0, 10)).toBe('balanced');
    expect(workloadLoad(5, 0, 10)).toBe('light');
  });
});

describe('sprintPace', () => {
  it('is slightly behind up to 15% of committed above ideal', () => {
    expect(sprintPace(30, 30, 40)).toBe('on_track');
    expect(sprintPace(36, 30, 40)).toBe('slightly_behind');
    expect(sprintPace(37, 30, 40)).toBe('behind');
  });
});

describe('report queries', () => {
  it('defaults to 4w', () => {
    expect(reportQuerySchema.parse({}).period).toBe('4w');
  });

  it('a custom period needs from ≤ to, at most 366 days', () => {
    expect(reportQuerySchema.safeParse({ period: 'custom' }).success).toBe(false);
    expect(
      personReportQuerySchema.safeParse({ period: 'custom', from: '2026-10-02', to: '2026-10-01' })
        .success,
    ).toBe(false);
    expect(
      reportQuerySchema.safeParse({ period: 'custom', from: '2025-10-01', to: '2026-10-01' })
        .success,
    ).toBe(true);
    expect(
      reportQuerySchema.safeParse({ period: 'custom', from: '2025-09-30', to: '2026-10-01' })
        .success,
    ).toBe(false);
  });
});
