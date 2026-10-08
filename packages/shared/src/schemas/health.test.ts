import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy payload', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      db: 'up',
      time: '2026-10-08T09:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'fine',
      db: 'up',
      time: '2026-10-08T09:00:00.000Z',
    });
    expect(result.success).toBe(false);
  });
});
