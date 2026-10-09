import { describe, expect, it } from 'vitest';
import { dropTarget, isNoop, keySlot, type ColumnIds } from './boardDrag';

const COLUMNS: ColumnIds[] = [
  { key: 'todo', ids: ['a', 'b', 'c'] },
  { key: 'review', ids: ['d', 'e'] },
  { key: 'done', ids: [] },
];

describe('dropTarget', () => {
  it('lands before or after the card under the pointer', () => {
    expect(
      dropTarget(COLUMNS, 'b', { kind: 'card', id: 'e', columnKey: 'review', after: false }, null),
    ).toEqual({ columnKey: 'review', prevId: 'd', nextId: 'e' });
    expect(
      dropTarget(COLUMNS, 'b', { kind: 'card', id: 'e', columnKey: 'review', after: true }, null),
    ).toEqual({ columnKey: 'review', prevId: 'e', nextId: null });
  });

  it('skips the dragged card when reading neighbours in its own column', () => {
    expect(
      dropTarget(COLUMNS, 'b', { kind: 'card', id: 'c', columnKey: 'todo', after: false }, null),
    ).toEqual({ columnKey: 'todo', prevId: 'a', nextId: 'c' });
  });

  it('goes to the end of a column (or an empty one)', () => {
    expect(dropTarget(COLUMNS, 'a', { kind: 'column', columnKey: 'review' }, null)).toEqual({
      columnKey: 'review',
      prevId: 'e',
      nextId: null,
    });
    expect(dropTarget(COLUMNS, 'a', { kind: 'column', columnKey: 'done' }, null)).toEqual({
      columnKey: 'done',
      prevId: null,
      nextId: null,
    });
  });

  it('keeps the current target over the placeholder or its own column', () => {
    const current = { columnKey: 'review', prevId: 'd', nextId: 'e' };
    expect(dropTarget(COLUMNS, 'a', { kind: 'placeholder' }, current)).toBe(current);
    expect(dropTarget(COLUMNS, 'a', { kind: 'column', columnKey: 'review' }, current)).toBe(
      current,
    );
  });
});

describe('isNoop', () => {
  it('is true only right where the card already is', () => {
    expect(isNoop(COLUMNS, 'b', { columnKey: 'todo', prevId: 'a', nextId: 'c' })).toBe(true);
    expect(isNoop(COLUMNS, 'b', { columnKey: 'todo', prevId: null, nextId: 'a' })).toBe(false);
    expect(isNoop(COLUMNS, 'b', { columnKey: 'review', prevId: 'a', nextId: 'c' })).toBe(false);
    expect(isNoop(COLUMNS, 'c', { columnKey: 'todo', prevId: 'b', nextId: null })).toBe(true);
  });
});

describe('keySlot', () => {
  it('steps within a column and jumps between columns', () => {
    // Picked up b (todo, index 1).
    expect(keySlot(COLUMNS, 'b', null, 'down')).toEqual({
      columnKey: 'todo',
      beforeId: null,
      lastId: 'c',
    });
    expect(keySlot(COLUMNS, 'b', null, 'up')).toEqual({
      columnKey: 'todo',
      beforeId: 'a',
      lastId: 'c',
    });
    expect(keySlot(COLUMNS, 'b', null, 'right')).toEqual({
      columnKey: 'review',
      beforeId: 'e',
      lastId: 'e',
    });
    const inReview = { columnKey: 'review', prevId: 'e', nextId: null };
    expect(keySlot(COLUMNS, 'b', inReview, 'right')).toEqual({
      columnKey: 'done',
      beforeId: null,
      lastId: null,
    });
    expect(keySlot(COLUMNS, 'b', inReview, 'left')).toEqual({
      columnKey: 'todo',
      beforeId: null,
      lastId: 'c',
    });
  });
});
