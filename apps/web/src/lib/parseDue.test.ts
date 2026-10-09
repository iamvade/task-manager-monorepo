import { describe, expect, it } from 'vitest';
import { parseDue } from './parseDue';

// Thursday.
const TODAY = '2026-10-08';

describe('parseDue', () => {
  it.each([
    ['today', '2026-10-08'],
    ['tomorrow', '2026-10-09'],
    ['next fri', '2026-10-16'],
    ['fri', '2026-10-09'],
    ['oct 14', '2026-10-14'],
    ['Oct 2', '2027-10-02'],
    ['in 3 days', '2026-10-11'],
    ['in two weeks', '2026-10-22'],
    ['next week', '2026-10-12'],
    ['10/14', '2026-10-14'],
    ['2026-11-30', '2026-11-30'],
  ])('English: %s → %s', (text, expected) => {
    expect(parseDue(text, TODAY)).toBe(expected);
  });

  it.each([
    ['өнөөдөр', '2026-10-08'],
    ['Маргааш', '2026-10-09'],
    ['нөгөөдөр', '2026-10-10'],
    ['дараа долоо хоног', '2026-10-12'],
    ['дараа баасан', '2026-10-16'],
    ['баасан', '2026-10-09'],
    ['мягмар', '2026-10-13'],
    ['пүрэв', '2026-10-08'],
    ['баасан гараг', '2026-10-09'],
    ['3 хоногийн дараа', '2026-10-11'],
    ['2 долоо хоногийн дараа', '2026-10-22'],
    ['10-р сарын 14', '2026-10-14'],
    ['1-р сарын 5', '2027-01-05'],
    ['амралтын өдөр', '2026-10-10'],
  ])('Mongolian: %s → %s', (text, expected) => {
    expect(parseDue(text, TODAY)).toBe(expected);
  });

  it.each(['', '   ', 'garbage', 'asdf qwer', '2026-02-31', '2-р сарын 31'])(
    'unparseable %j → null',
    (text) => {
      expect(parseDue(text, TODAY)).toBeNull();
    },
  );
});
