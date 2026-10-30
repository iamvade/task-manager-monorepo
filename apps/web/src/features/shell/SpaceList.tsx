import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  canManageStructure,
  type SidebarProject,
  type SidebarResponse,
  type SidebarSpace,
} from '@kite/shared';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMoveProject, useMoveSpace } from '../../api/spaces';
import { useCurrentWorkspace, type useSidebar } from '../../api/workspaces';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useUiStore } from '../../stores/ui';
import { DragRow, PROJECT_PREFIX, SPACE_PREFIX, SpaceTreeItem } from './SpaceTree';
import { useShellLocation } from './useShellLocation';

/** Project ids per space while a project is dragged (it may cross into another space). */
type Lists = Record<string, string[]>;

const idOf = (id: UniqueIdentifier) => String(id).replace(/^(space|project):/, '');
const isSpaceId = (id: UniqueIdentifier) => String(id).startsWith(SPACE_PREFIX);

const listsOf = (data: SidebarResponse): Lists =>
  Object.fromEntries(data.spaces.map((s) => [s.id, s.projects.map((p) => p.id)]));

const spaceOfIn = (lists: Lists, projectId: string) =>
  Object.keys(lists).find((s) => lists[s]?.includes(projectId));

/** The neighbors of `id` in `order` (what the move routes take). */
const neighbors = (order: string[], id: string) => {
  const i = order.indexOf(id);
  return { prevId: order[i - 1] ?? null, nextId: order[i + 1] ?? null };
};

export function SpaceList({
  query,
  workspaceId,
}: {
  query: ReturnType<typeof useSidebar>;
  workspaceId: string | undefined;
}) {
  const { t } = useTranslation();
  const { projectId, spaceId } = useShellLocation();
  const openSpaces = useUiStore((s) => s.openSpaces);
  const setSpaceOpen = useUiStore((s) => s.setSpaceOpen);
  const workspace = useCurrentWorkspace();
  const canManage = workspace ? canManageStructure(workspace.role) : false;
  const moveSpace = useMoveSpace(workspaceId ?? '');
  const moveProject = useMoveProject(workspaceId ?? '');
  const activeSpaceId = activeProjectSpace(query.data, projectId) ?? spaceId;

  const [activeId, setActiveId] = useState<string | null>(null);
  const [lists, setLists] = useState<Lists | null>(null);
  // A drop ends on the row under the pointer: its click must not follow the link.
  const justDropped = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  // Opening a project or space (e.g. from a link) expands its space once.
  useEffect(() => {
    if (activeSpaceId && openSpaces[activeSpaceId] === undefined) setSpaceOpen(activeSpaceId, true);
  }, [activeSpaceId, openSpaces, setSpaceOpen]);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 px-3 py-2">
        {[64, 88, 56].map((w) => (
          <div key={w} className="flex items-center gap-2">
            <Skeleton width={18} height={18} />
            <Skeleton width={w} height={10} />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 px-3 py-2 text-[12px] text-muted"
      >
        {t('shell.loadError')}
        <Button size="sm" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }

  const data = query.data;
  const isOpen = (space: SidebarSpace) => openSpaces[space.id] ?? space.id === activeSpaceId;
  const projectsById = new Map<string, SidebarProject>(
    data.spaces.flatMap((s) => s.projects.map((p) => [p.id, p] as const)),
  );
  const projectsOf = (space: SidebarSpace) =>
    lists ? (lists[space.id] ?? []).flatMap((id) => projectsById.get(id) ?? []) : space.projects;
  const nameOf = (id: UniqueIdentifier) =>
    isSpaceId(id)
      ? (data.spaces.find((s) => s.id === idOf(id))?.name ?? '')
      : (projectsById.get(idOf(id))?.name ?? '');

  /**
   * A space is dragged among spaces (with its projects). A project goes over
   * projects, or over a space row that shows none (collapsed or empty) to land at its end.
   */
  const collisionDetection: CollisionDetection = (args) => {
    const space = isSpaceId(args.active.id);
    const targets = {
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => {
        if (space) return isSpaceId(c.id);
        if (!isSpaceId(c.id)) return true;
        const target = data.spaces.find((s) => s.id === idOf(c.id));
        return Boolean(target && (!isOpen(target) || (lists?.[target.id]?.length ?? 0) === 0));
      }),
    };
    // The row under the pointer (so passing a collapsed space doesn't open it); the keyboard
    // and the gaps between rows fall back to the closest row.
    const under = pointerWithin(targets);
    return under.length > 0 ? under : closestCenter(targets);
  };

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || isSpaceId(active.id) || !lists) return;
    const id = idOf(active.id);
    const from = spaceOfIn(lists, id);
    const to = isSpaceId(over.id) ? idOf(over.id) : spaceOfIn(lists, idOf(over.id));
    if (!from || !to || from === to) return;
    const target = (lists[to] ?? []).filter((x) => x !== id);
    const at = isSpaceId(over.id) ? target.length : target.indexOf(idOf(over.id));
    target.splice(at < 0 ? target.length : at, 0, id);
    setLists({ ...lists, [from]: (lists[from] ?? []).filter((x) => x !== id), [to]: target });
    const space = data.spaces.find((s) => s.id === to);
    if (space && !isOpen(space)) setSpaceOpen(to, true);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const current = lists;
    reset();
    justDropped.current = true;
    setTimeout(() => {
      justDropped.current = false;
    });
    if (!over) return;
    const id = idOf(active.id);
    if (isSpaceId(active.id)) {
      const ids = data.spaces.map((s) => s.id);
      const from = ids.indexOf(id);
      const to = ids.indexOf(idOf(over.id));
      if (from < 0 || to < 0 || from === to) return;
      moveSpace.mutate({ spaceId: id, ...neighbors(arrayMove(ids, from, to), id) });
      return;
    }
    if (!current) return;
    const spaceIdNow = spaceOfIn(current, id);
    if (!spaceIdNow) return;
    let order = current[spaceIdNow] ?? [];
    if (!isSpaceId(over.id)) {
      const from = order.indexOf(id);
      const to = order.indexOf(idOf(over.id));
      if (from >= 0 && to >= 0) order = arrayMove(order, from, to);
    }
    const original = data.spaces.find((s) => s.projects.some((p) => p.id === id));
    const before = original?.projects.map((p) => p.id) ?? [];
    if (original?.id === spaceIdNow && before.join() === order.join()) return;
    moveProject.mutate({ projectId: id, spaceId: spaceIdNow, ...neighbors(order, id) });
  }

  function reset() {
    setActiveId(null);
    setLists(null);
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t('shell.dnd.picked', { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over
        ? t('shell.dnd.over', { name: nameOf(active.id), target: nameOf(over.id) })
        : t('shell.dnd.notOver', { name: nameOf(active.id) }),
    onDragEnd: ({ active }) => t('shell.dnd.dropped', { name: nameOf(active.id) }),
    onDragCancel: ({ active }) => t('shell.dnd.cancelled', { name: nameOf(active.id) }),
  };

  const activeItem = activeId
    ? isSpaceId(activeId)
      ? data.spaces.find((s) => s.id === idOf(activeId))
      : projectsById.get(idOf(activeId))
    : undefined;

  return (
    <div
      className="flex flex-col gap-0.5"
      onClickCapture={(e) => {
        if (justDropped.current) e.preventDefault();
      }}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: t('shell.dnd.instructions') },
        }}
        onDragStart={({ active }) => {
          setActiveId(String(active.id));
          if (!isSpaceId(active.id)) setLists(listsOf(data));
        }}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        <SortableContext
          items={data.spaces.map((s) => `${SPACE_PREFIX}${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {data.spaces.map((space) => {
            const projects = projectsOf(space);
            return (
              <SpaceTreeItem
                key={space.id}
                workspaceId={workspaceId}
                space={space}
                projects={projects}
                open={isOpen(space)}
                onToggle={(open) => {
                  setSpaceOpen(space.id, open);
                }}
                active={space.id === spaceId}
                activeProjectId={projectId}
                canManage={canManage}
                renderProjects={(children) => (
                  <SortableContext
                    items={projects.map((p) => `${PROJECT_PREFIX}${p.id}`)}
                    strategy={verticalListSortingStrategy}
                  >
                    {children}
                  </SortableContext>
                )}
              />
            );
          })}
        </SortableContext>
        <DragOverlay dropAnimation={null}>
          {activeItem ? <DragRow item={activeItem} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function activeProjectSpace(data: SidebarResponse | undefined, projectId: string | undefined) {
  if (!data || !projectId) return undefined;
  return data.spaces.find((s) => s.projects.some((p) => p.id === projectId))?.id;
}
