import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuid } from './randomUuid';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('works without crypto.randomUUID (plain-http origins)', () => {
    const real = crypto;
    vi.stubGlobal('crypto', {
      getRandomValues: (array: Uint8Array<ArrayBuffer>) => real.getRandomValues(array),
    });
    const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
