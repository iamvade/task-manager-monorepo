import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type Over,
} from '@dnd-kit/core';
import type { ProjectDetail, TaskListItem, WorkspaceMember } from '@kite/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoveTask } from '../../api/tasks';
import { toast } from '../../stores/toast';
import { useUiStore } from '../../stores/ui';
import { groupTasks, sortTasks, type TaskGroup } from '../list/grouping';
import { placeInStatus } from '../list/positions';
import { statusRef, useCreateInStatus } from '../list/useCreateInStatus';
import type { ListScope } from '../views/taskQuery';
import { useViewParams } from '../views/useViewParams';
import { COLUMN_PREFIX, BoardColumn } from './BoardColumn';
import {
  dropTarget,
  isNoop,
  keySlot,
  sameTarget,
  type KeyMove,
  type ColumnIds,
  type DragOver,
  type DropTarget,
} from './boardDrag';
import { PLACEHOLDER_ID } from './DropPlaceholder';
import { TaskCard } from './TaskCard';

interface BoardProps {
  scope: ListScope;
  /** Key for remembered collapsed columns: `board:p:<projectId>` / `board:s:<spaceId>`. */
  boardKey: string;
  /** Accessible name of the board. */
  label: string;
  tasks: readonly TaskListItem[];
  /** Project board: statuses (columns), create target. Null on the space board. */
  project: ProjectDetail | null;
  members: readonly WorkspaceMember[];
}

/**
 * The Board (Board.dc.html): one column per status (space board: per status category), cards
 * in manual order unless a sort is picked. Drag a card with the pointer or the keyboard
 * (Space, arrows, Space): the card lifts, its spot shows a dashed ghost, and the target column
 * shows "Drop to move to …". Dropping moves it optimistically; a failure rolls back + toast.
 */
export function Board({ scope, boardKey, label, tasks, project, members }: BoardProps) {
  const { t } = useTranslation();
  const view = useViewParams();
  const statuses = project?.statuses ?? null;
  const statusRank = useMemo(
    () => (statuses ? new Map(statuses.map((s, i) => [s.id, i])) : null),
    [statuses],
  );
  const columns = useMemo(
    () => groupTasks(sortTasks(tasks, view.sort, statusRank), 'status', { statuses }),
    [tasks, view.sort, statusRank, statuses],
  );
  const columnIds = useMemo<ColumnIds[]>(
    () => columns.map((c) => ({ key: c.key, ids: c.tasks.map((x) => x.id) })),
    [columns],
  );
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const labelOf = (c: TaskGroup) => c.name ?? (c.labelKey ? t(c.labelKey) : '');

  const stored = useUiStore((s) => s.collapsedGroups[boardKey]);
  const setCollapsed = useUiStore((s) => s.setGroupCollapsed);
  const openCreate = useUiStore((s) => s.openCreate);
  const [adding, setAdding] = useState<string | null>(null);
  const createInStatus = useCreateInStatus(project, tasks, members);
  const move = useMoveTask();

  const { params } = view;
  const taskHref = useCallback(
    (task: TaskListItem) => {
      const next = new URLSearchParams(params);
      next.set('task', task.key);
      return `?${next.toString()}`;
    },
    [params],
  );

  // ---- Drag and drop (project board). ----
  const dnd = scope === 'project' && Boolean(statuses);
  const KEY_MOVES: Record<string, KeyMove> = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };
  /**
   * Keyboard drag: ←/→ go to the neighbouring column, ↑/↓ through the slots of one. The lifted
   * card is placed just above the center of the card it should land before (or just below the
   * last card), so collision detection reads the same target as for the pointer.
   */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const move = KEY_MOVES[event.code];
    const { active, collisionRect, droppableRects } = context;
    if (!move || !active || !collisionRect) return undefined;
    event.preventDefault();
    const slot = keySlot(columnIds, String(active.id), targetRef.current, move);
    if (!slot) return undefined;
    const half = collisionRect.height / 2;
    const card = slot.beforeId ?? slot.lastId;
    const rect = card ? droppableRects.get(card) : undefined;
    if (card && rect) {
      const center = rect.top + rect.height / 2;
      return { x: rect.left, y: center - half + (slot.beforeId ? -2 : 2) };
    }
    const column = droppableRects.get(`${COLUMN_PREFIX}${slot.columnKey}`);
    return column ? { x: column.left + 8, y: column.top + 48 } : undefined;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const targetRef = useRef<DropTarget | null>(null);

  const columnOf = (id: string) => columnIds.find((c) => c.ids.includes(id))?.key ?? null;

  /**
   * Column under the pointer (keyboard: under the lifted card's center) first, then the closest
   * card (or the placeholder) in it.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const rect = args.collisionRect;
    const point = args.pointerCoordinates ?? {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    const hit = args.droppableContainers.find((c) => {
      const r = args.droppableRects.get(c.id);
      return String(c.id).startsWith(COLUMN_PREFIX) && r && point.x >= r.left && point.x <= r.right;
    });
    if (!hit) return closestCenter(args);
    const key = String(hit.id).slice(COLUMN_PREFIX.length);
    const ids = columnIds.find((c) => c.key === key)?.ids ?? [];
    const inColumn = args.droppableContainers.filter(
      (c) => c.id === PLACEHOLDER_ID || ids.includes(String(c.id)),
    );
    if (!inColumn.length) return [{ id: hit.id }];
    return closestCenter({ ...args, droppableContainers: inColumn });
  };

  function overOf(active: Active, over: Over): DragOver | null {
    const id = String(over.id);
    if (id === PLACEHOLDER_ID) return { kind: 'placeholder' };
    if (id.startsWith(COLUMN_PREFIX)) {
      return { kind: 'column', columnKey: id.slice(COLUMN_PREFIX.length) };
    }
    const columnKey = columnOf(id);
    if (!columnKey) return null;
    const rect = active.rect.current.translated;
    const center = rect ? rect.top + rect.height / 2 : 0;
    return { kind: 'card', id, columnKey, after: center > over.rect.top + over.rect.height / 2 };
  }

  function track(active: Active, over: Over | null) {
    if (!over) return;
    const o = overOf(active, over);
    if (!o) return;
    const next = dropTarget(columnIds, String(active.id), o, targetRef.current);
    if (sameTarget(next, targetRef.current)) return;
    targetRef.current = next;
    setTarget(next);
  }

  function reset() {
    setActiveId(null);
    targetRef.current = null;
    setTarget(null);
  }

  function onDragEnd({ active }: DragEndEvent) {
    const drop = targetRef.current;
    reset();
    const task = byId.get(String(active.id));
    if (!drop || !task || isNoop(columnIds, task.id, drop)) return;
    const column = columns.find((c) => c.key === drop.columnKey);
    if (!column?.status) return;
    const status = column.status;
    const placement = placeInStatus(
      tasks.filter((x) => x.status.id === status.id),
      task.id,
      drop.prevId,
      drop.nextId,
    );
    move.mutate(
      { task, status: statusRef(status), ...placement },
      {
        onError: () => {
          toast({ message: t('board.moveFailed'), tone: 'danger' });
        },
      },
    );
    // The dropped order is the manual order: show it.
    if (view.sort !== 'manual') view.update({ sort: null });
  }

  const columnLabel = (key: string | undefined) => {
    const column = columns.find((c) => c.key === key);
    return column ? labelOf(column) : '';
  };
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('board.dnd.picked', { title: titleOf(active.id) }),
    onDragOver: ({ active }) =>
      targetRef.current
        ? t('board.dnd.over', {
            title: titleOf(active.id),
            status: columnLabel(targetRef.current.columnKey),
          })
        : t('board.dnd.notOver', { title: titleOf(active.id) }),
    onDragEnd: ({ active }) =>
      t('board.dnd.dropped', {
        title: titleOf(active.id),
        status: columnLabel(targetRef.current?.columnKey ?? columnOf(String(active.id)) ?? ''),
      }),
    onDragCancel: ({ active }) => t('board.dnd.cancelled', { title: titleOf(active.id) }),
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;
  const showPlaceholder = Boolean(target && activeId && !isNoop(columnIds, activeId, target));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        role="region"
        aria-label={label}
        className="flex min-h-0 flex-1 overflow-x-auto px-6 pt-4 pb-8"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t('board.dnd.instructions') },
          }}
          onDragStart={({ active }) => {
            setActiveId(String(active.id));
          }}
          onDragOver={({ active, over }) => {
            track(active, over);
          }}
          onDragMove={({ active, over }) => {
            track(active, over);
          }}
          onDragEnd={onDragEnd}
          onDragCancel={reset}
        >
          <div className="flex min-h-0 flex-1 items-start gap-4">
            {columns.map((column) => {
              const name = labelOf(column);
              const collapsed = stored?.[column.key] ?? false;
              const status = column.status;
              return (
                <BoardColumn
                  key={column.key}
                  columnKey={column.key}
                  label={name}
                  category={column.marker.kind === 'status' ? column.marker.category : 'todo'}
                  tasks={column.tasks}
                  isTarget={Boolean(activeId) && target?.columnKey === column.key}
                  target={target}
                  showPlaceholder={showPlaceholder}
                  dnd={dnd}
                  collapsed={collapsed}
                  onToggleCollapsed={() => {
                    setCollapsed(boardKey, column.key, !collapsed);
                  }}
                  onAdd={
                    dnd && status
                      ? (title) => {
                          createInStatus(status, title);
                        }
                      : null
                  }
                  adding={adding === column.key}
                  onStartAdd={() => {
                    if (collapsed) setCollapsed(boardKey, column.key, false);
                    setAdding(column.key);
                  }}
                  onCancelAdd={() => {
                    setAdding((current) => (current === column.key ? null : current));
                  }}
                  onCreate={() => {
                    openCreate(
                      project && status
                        ? {
                            projectId: project.id,
                            statusId: status.id,
                            ...(view.sprintId ? { sprintId: view.sprintId } : {}),
                          }
                        : {
                            statusCategory:
                              column.marker.kind === 'status' ? column.marker.category : 'todo',
                          },
                    );
                  }}
                  taskHref={taskHref}
                  showProject={scope === 'space'}
                />
              );
            })}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeTask && (
              <TaskCard task={activeTask} state="overlay" showProject={scope === 'space'} />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
