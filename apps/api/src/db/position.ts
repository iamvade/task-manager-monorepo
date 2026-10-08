import type { Move } from '@kite/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { httpError } from '../errors.js';

const invalidMove = (message: string) => httpError(400, 'INVALID_MOVE', message);

/** Position key after `last` (`null` = empty list). */
export const positionAfter = (last: string | null | undefined) =>
  generateKeyBetween(last ?? null, null);

/**
 * New position for `movedId` between the neighbors named in `move`, which must belong to `scope`
 * (the items of the destination list). With no neighbors the item goes to the end.
 */
export function movePosition(
  scope: readonly { id: string; position: string }[],
  movedId: string,
  { prevId, nextId }: Move,
): string {
  const others = scope.filter((item) => item.id !== movedId);
  const find = (id: string | null) => {
    if (id === null) return null;
    const item = others.find((o) => o.id === id);
    if (!item) throw invalidMove('Neighbor is not in the target list');
    return item.position;
  };
  const prev = find(prevId);
  const next = find(nextId);
  if (prev === null && next === null) {
    const last = others.reduce<string | null>(
      (max, o) => (max === null || o.position > max ? o.position : max),
      null,
    );
    return positionAfter(last);
  }
  if (prev !== null && next !== null && prev >= next) {
    throw invalidMove('Neighbors are out of order');
  }
  return generateKeyBetween(prev, next);
}
