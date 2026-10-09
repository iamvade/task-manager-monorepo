/** A column as the board shows it: card ids in display order. */
export interface ColumnIds {
  key: string;
  ids: readonly string[];
}

/** Where a dragged card would land: between `prevId` and `nextId` of `columnKey`. */
export interface DropTarget {
  columnKey: string;
  prevId: string | null;
  nextId: string | null;
}

/** What the pointer (or keyboard) is over while dragging. */
export type DragOver =
  | { kind: 'card'; id: string; columnKey: string; after: boolean }
  | { kind: 'column'; columnKey: string }
  | { kind: 'placeholder' };

const others = (column: ColumnIds | undefined, activeId: string) =>
  (column?.ids ?? []).filter((id) => id !== activeId);

/**
 * The drop target for `over`. Over a card: right before it, or right after when the dragged
 * card's center is below the card's center. Over a column's empty space: its end (or the
 * current target if already in that column). Over the placeholder: unchanged, so it doesn't
 * flicker as it pushes cards down.
 */
export function dropTarget(
  columns: readonly ColumnIds[],
  activeId: string,
  over: DragOver,
  current: DropTarget | null,
): DropTarget | null {
  if (over.kind === 'placeholder') return current;
  const column = columns.find((c) => c.key === over.columnKey);
  const ids = others(column, activeId);
  if (over.kind === 'column') {
    if (current?.columnKey === over.columnKey) return current;
    return { columnKey: over.columnKey, prevId: ids.at(-1) ?? null, nextId: null };
  }
  const index = ids.indexOf(over.id);
  if (index < 0) return current;
  return over.after
    ? { columnKey: over.columnKey, prevId: over.id, nextId: ids[index + 1] ?? null }
    : { columnKey: over.columnKey, prevId: ids[index - 1] ?? null, nextId: over.id };
}

/** True when dropping at `target` leaves the card where it is. */
export function isNoop(
  columns: readonly ColumnIds[],
  activeId: string,
  target: DropTarget,
): boolean {
  const column = columns.find((c) => c.ids.includes(activeId));
  if (column?.key !== target.columnKey) return false;
  const index = column.ids.indexOf(activeId);
  return (
    (column.ids[index - 1] ?? null) === target.prevId &&
    (column.ids[index + 1] ?? null) === target.nextId
  );
}

export const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.columnKey === b.columnKey &&
    a.prevId === b.prevId &&
    a.nextId === b.nextId);

export type KeyMove = 'up' | 'down' | 'left' | 'right';

/** Where an arrow key takes a keyboard-dragged card: a card to land before, or a column's end. */
export interface KeySlot {
  columnKey: string;
  /** Land right before this card; null = the end of the column. */
  beforeId: string | null;
  /** The column's last card (other than the dragged one), for landing at the end. */
  lastId: string | null;
}

/**
 * Keyboard drag (Space, arrows, Space): ↑/↓ step through the slots of the current column,
 * ←/→ jump to the same slot of the neighbouring column (or its end).
 */
export function keySlot(
  columns: readonly ColumnIds[],
  activeId: string,
  current: DropTarget | null,
  move: KeyMove,
): KeySlot | null {
  const fromKey = current?.columnKey ?? columns.find((c) => c.ids.includes(activeId))?.key;
  const from = columns.findIndex((c) => c.key === fromKey);
  if (from < 0) return null;
  const ids = others(columns[from], activeId);
  let slot = current
    ? current.nextId
      ? Math.max(0, ids.indexOf(current.nextId))
      : ids.length
    : Math.max(0, (columns[from]?.ids ?? []).indexOf(activeId));

  let index = from;
  if (move === 'up') slot = Math.max(0, slot - 1);
  if (move === 'down') slot = Math.min(ids.length, slot + 1);
  if (move === 'left') index = Math.max(0, from - 1);
  if (move === 'right') index = Math.min(columns.length - 1, from + 1);
  const column = columns[index];
  if (!column) return null;
  const target = others(column, activeId);
  slot = Math.min(slot, target.length);
  return { columnKey: column.key, beforeId: target[slot] ?? null, lastId: target.at(-1) ?? null };
}
