import { describe, expect, it } from 'vitest';
import { findTaskKeys, formatTaskKey, parseTaskKey, splitTaskKeys } from './task-key.js';

describe('task keys', () => {
  it('formats and parses', () => {
    expect(formatTaskKey('APP', 142)).toBe('APP-142');
    expect(parseTaskKey('APP-142')).toEqual({ key: 'APP', number: 142 });
    expect(parseTaskKey(' app-7 ')).toEqual({ key: 'APP', number: 7 });
    expect(parseTaskKey('Q4R-12')).toEqual({ key: 'Q4R', number: 12 });
  });

  it('rejects anything else', () => {
    for (const text of [
      'APP',
      'APP-',
      '142',
      'A-1',
      'APP-0',
      'APP-1x',
      '1AP-2',
      'APP-99999999999',
    ]) {
      expect(parseTaskKey(text), text).toBeNull();
    }
  });
});

describe('findTaskKeys', () => {
  it('finds uppercase keys once, in order, not inside words or versions', () => {
    expect(
      findTaskKeys(
        'See PAY-2401 and APP-12, again PAY-2401; not covid-19, X-1, MY-APP-3x or v2-10',
      ),
    ).toEqual([
      { key: 'PAY', number: 2401, text: 'PAY-2401' },
      { key: 'APP', number: 12, text: 'APP-12' },
    ]);
    expect(findTaskKeys('APP-0 is no task')).toEqual([]);
  });

  it('splits text around keys', () => {
    expect(splitTaskKeys('Blocked by APP-12.')).toEqual([
      { text: 'Blocked by ' },
      { key: 'APP-12', text: 'APP-12' },
      { text: '.' },
    ]);
  });
});
