import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from './client';

describe('parseRetryAfter', () => {
  it('reads whole seconds', () => {
    expect(parseRetryAfter('51')).toBe(51);
    expect(parseRetryAfter(' 7 ')).toBe(7);
  });

  it('ignores missing, HTTP-date and malformed values', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:00 GMT')).toBeUndefined();
    expect(parseRetryAfter('-3')).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
  });
});
