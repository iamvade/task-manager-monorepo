import { describe, expect, it } from 'vitest';
import { awayUntil, createAbsenceSchema, currentAbsence, isAway } from './absence.js';

const a = (id: string, startDate: string, endDate: string, note: string | null = null) => ({
  id,
  startDate,
  endDate,
  note,
});

describe('currentAbsence', () => {
  it('finds the absence covering today, both ends included', () => {
    const absences = [a('1', '2026-10-08', '2026-10-11', 'Vacation')];
    expect(currentAbsence(absences, '2026-10-07')).toBeNull();
    expect(currentAbsence(absences, '2026-10-08')).toEqual({
      until: '2026-10-11',
      note: 'Vacation',
    });
    expect(currentAbsence(absences, '2026-10-11')).toEqual({
      until: '2026-10-11',
      note: 'Vacation',
    });
    expect(currentAbsence(absences, '2026-10-12')).toBeNull();
  });

  it('extends over back-to-back absences but not over a gap', () => {
    const absences = [
      a('3', '2026-10-20', '2026-10-22'),
      a('2', '2026-10-12', '2026-10-15'),
      a('1', '2026-10-08', '2026-10-11'),
    ];
    expect(currentAbsence(absences, '2026-10-09')?.until).toBe('2026-10-15');
  });

  it('backs isAway and awayUntil', () => {
    const member = { absences: [a('1', '2026-10-08', '2026-10-11')] };
    expect(isAway(member, '2026-10-09')).toBe(true);
    expect(awayUntil(member, '2026-10-09')).toBe('2026-10-11');
    expect(awayUntil(member, '2026-10-01')).toBeNull();
  });
});

describe('createAbsenceSchema', () => {
  it('rejects an end before the start and blanks the note', () => {
    expect(
      createAbsenceSchema.safeParse({ startDate: '2026-10-09', endDate: '2026-10-08' }).success,
    ).toBe(false);
    expect(
      createAbsenceSchema.parse({ startDate: '2026-10-08', endDate: '2026-10-08', note: ' ' }),
    ).toEqual({
      startDate: '2026-10-08',
      endDate: '2026-10-08',
      note: null,
    });
  });
});
