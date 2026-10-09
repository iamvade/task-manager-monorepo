import { describe, expect, it } from 'vitest';
import { formatTaskKey, parseTaskKey } from './task-key.js';

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
