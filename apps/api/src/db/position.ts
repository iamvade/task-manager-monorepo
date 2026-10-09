import type { Move } from '@kite/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { httpError } from '../errors.js';

const invalidMove = (message: string) => httpError(400, 'INVALID_MOVE', message);

/** Position key after `last` (`null` = empty list). */
export const positionAfter = (last: string | null | undefined) =>
  generateKeyBetween(last ?? null, null);

/** Position key before `first` (`null` = empty list). */
export const positionBefore = (first: string | null | undefined) =>
  generateKeyBetween(null, first ?? null);

export interface Positioned {
  id: string;
  position: string;
  /** False for rows that hold a key but can't be neighbors (soft-deleted tasks). */
  live?: boolean;
}

/**
 * New position for `movedId` between the neighbors named in `move`, which must be live items of
 * `scope` (every item of the destination list, including any that aren't live).
 *
 * The key goes right after `prevId` (or right before `nextId` when only that is given), between
 * the neighbor and its actual successor in `scope`. So a client whose view hides some items
 * (filters) still lands next to the neighbor it saw, and the key never equals an existing one.
 * With no neighbors the item goes to the end.
 */
export function movePosition(
  scope: readonly Positioned[],
  movedId: string,
  { prevId, nextId }: Move,
): string {
  const others = scope
    .filter((item) => item.id !== movedId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
  const indexOf = (id: string) => {
    const i = others.findIndex((o) => o.id === id && o.live !== false);
    if (i < 0) throw invalidMove('Neighbor is not in the target list');
    return i;
  };
  const at = (i: number) => others[i]?.position ?? null;

  if (prevId !== null) {
    const prev = indexOf(prevId);
    if (nextId !== null && indexOf(nextId) <= prev) {
      throw invalidMove('Neighbors are out of order');
    }
    return generateKeyBetween(at(prev), at(prev + 1));
  }
  if (nextId !== null) {
    const next = indexOf(nextId);
    return generateKeyBetween(at(next - 1), at(next));
  }
  return positionAfter(at(others.length - 1));
}
