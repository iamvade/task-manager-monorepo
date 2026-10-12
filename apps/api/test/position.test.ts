import { describe, expect, it } from 'vitest';
import {
  movePosition,
  positionAfter,
  positionBefore,
  type Positioned,
} from '../src/db/position.js';

/** Byte-wise order, like the `position` column's `COLLATE "C"`. */
const byteOrder = (a: string, b: string) => Buffer.compare(Buffer.from(a), Buffer.from(b));
const sorted = (keys: string[]) => [...keys].sort(byteOrder);

function list(...ids: string[]): Positioned[] {
  let last: string | null = null;
  return ids.map((id) => {
    last = positionAfter(last);
    return { id, position: last };
  });
}
const order = (items: Positioned[]) =>
  [...items].sort((a, b) => byteOrder(a.position, b.position)).map((i) => i.id);

describe('position keys', () => {
  it('appends and prepends around the ends, and starts empty lists', () => {
    const first = positionAfter(null);
    expect(positionBefore(null)).toBe(first);
    const after = positionAfter(first);
    const before = positionBefore(first);
    expect(sorted([after, first, before])).toEqual([before, first, after]);
  });

  it('places the moved item right after prevId, right before nextId, or at the end', () => {
    const items = list('a', 'b', 'c', 'd');
    const move = (id: string, prevId: string | null, nextId: string | null) =>
      order(
        items.map((i) =>
          i.id === id ? { ...i, position: movePosition(items, id, { prevId, nextId }) } : i,
        ),
      );

    expect(move('d', 'a', 'b')).toEqual(['a', 'd', 'b', 'c']);
    expect(move('a', 'c', null)).toEqual(['b', 'c', 'a', 'd']);
    expect(move('d', null, 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(move('b', null, null)).toEqual(['a', 'c', 'd', 'b']);
    // Moving next to yourself is a no-op in effect.
    expect(move('b', 'a', 'c')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('lands next to the seen neighbor even when hidden items sit in between', () => {
    const items = list('a', 'hidden', 'b');
    const position = movePosition(items, 'x', { prevId: 'a', nextId: 'b' });
    expect(order([...items, { id: 'x', position }])).toEqual(['a', 'x', 'hidden', 'b']);
  });

  it('gives an empty list a first key with no neighbors', () => {
    expect(movePosition([], 'x', { prevId: null, nextId: null })).toBe(positionAfter(null));
  });

  it('rejects unknown, dead, or out-of-order neighbors', () => {
    const items: Positioned[] = [...list('a', 'b'), { id: 'gone', position: 'a5', live: false }];
    const err = { statusCode: 400, code: 'INVALID_MOVE' };
    expect(() => movePosition(items, 'x', { prevId: 'zzz', nextId: null })).toThrow(
      expect.objectContaining(err),
    );
    expect(() => movePosition(items, 'x', { prevId: 'gone', nextId: null })).toThrow(
      expect.objectContaining(err),
    );
    expect(() => movePosition(items, 'x', { prevId: 'b', nextId: 'a' })).toThrow(
      expect.objectContaining(err),
    );
    expect(() => movePosition(items, 'x', { prevId: 'a', nextId: 'a' })).toThrow(
      expect.objectContaining(err),
    );
  });

  it('keeps keys unique and ordered through 200 inserts into the same gap', () => {
    let items = list('top', 'bottom');
    for (let i = 0; i < 200; i += 1) {
      const id = `n${i}`;
      // Always drop right under "top": the gap keeps halving on one side.
      const position = movePosition(items, id, { prevId: 'top', nextId: null });
      items = [...items, { id, position }];
    }
    const keys = items.map((i) => i.position);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = order(items);
    expect(ids[0]).toBe('top');
    expect(ids.at(-1)).toBe('bottom');
    // Newest insert sits first after "top"; the oldest just above "bottom".
    expect(ids[1]).toBe('n199');
    expect(ids.at(-2)).toBe('n0');
    // Keys grow roughly one character per halving, staying far below a pathological size.
    expect(Math.max(...keys.map((k) => k.length))).toBeLessThan(220);
  });

  it('stays short for the common case of appending', () => {
    let last: string | null = null;
    for (let i = 0; i < 10_000; i += 1) last = positionAfter(last);
    expect(last?.length).toBeLessThan(8);
  });
});
