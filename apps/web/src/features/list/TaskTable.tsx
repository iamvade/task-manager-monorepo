import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  ProjectDetail,
  Status,
  Tag,
  TaskListItem,
  TaskStatusRef,
  WorkspaceMember,
} from '@kite/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  isTempTask,
  useCompleteTask,
  useCreateTask,
  useDeleteTask,
  useMoveTask,
  useSetAssignees,
  useSetTags,
  useUpdateTask,
} from '../../api/tasks';
import { useAuth } from '../../auth/useAuth';
import { useCopyLink } from '../../lib/useCopyLink';
import { useUiStore } from '../../stores/ui';
import type { ListScope } from '../views/taskQuery';
import { useViewParams } from '../views/useViewParams';
import { AddTaskRow } from './AddTaskRow';
import { GroupHeader } from './GroupHeader';
import { groupTasks, sortTasks, type TaskGroup } from './grouping';
import { GRID_COLUMNS, isDone, ListContext, type ListActions } from './ListContext';
import { placeInStatus } from './positions';
import { TaskRow } from './TaskRow';

interface TaskTableProps {
  scope: ListScope;
  /** Key for remembered collapsed groups: `p:<projectId>` / `s:<spaceId>`. */
  listKey: string;
  /** Accessible name of the table. */
  label: string;
  tasks: readonly TaskListItem[];
  /** Project list: statuses, team and create target. Null on the space list. */
  project: ProjectDetail | null;
  members: readonly WorkspaceMember[];
  tags: readonly Tag[];
  /** Group whose inline add row starts open (empty project → "Create first task"). */
  initialAdding?: string | null;
}

const GROUP_PREFIX = 'group:';
const statusRef = (s: Status): TaskStatusRef => ({
  id: s.id,
  name: s.name,
  category: s.category,
  color: s.color,
});

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    Boolean(target.closest('[role="dialog"], [role="menu"], [role="listbox"]'))
  );
}

/**
 * The List (Main.dc.html table): grouped rows, inline add, cell pickers, drag and drop
 * (status grouping on a project), j/k/Enter/x keyboard.
 */
export function TaskTable({
  scope,
  listKey,
  label,
  tasks,
  project,
  members,
  tags,
  initialAdding = null,
}: TaskTableProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const view = useViewParams();
  const rowHeight = me?.preferences.density === 'compact' ? 36 : 44;
  const statuses = project?.statuses ?? null;

  const statusRank = useMemo(
    () => (statuses ? new Map(statuses.map((s, i) => [s.id, i])) : null),
    [statuses],
  );
  const sorted = useMemo(
    () => sortTasks(tasks, view.sort, statusRank),
    [tasks, view.sort, statusRank],
  );
  const groups = useMemo(
    () => groupTasks(sorted, view.group, { statuses }),
    [sorted, view.group, statuses],
  );
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  // Collapsed groups, remembered per list.
  const stored = useUiStore((s) => s.collapsedGroups[listKey]);
  const setGroupCollapsed = useUiStore((s) => s.setGroupCollapsed);
  const isOpen = (g: TaskGroup) => g.key === 'all' || !(stored?.[g.key] ?? g.defaultCollapsed);

  // Mutations.
  const complete = useCompleteTask();
  const move = useMoveTask();
  const update = useUpdateTask();
  const setAssigneesMutation = useSetAssignees();
  const setTagsMutation = useSetTags();
  const remove = useDeleteTask();
  const create = useCreateTask(project?.id ?? '');
  const { copied, copy } = useCopyLink();
  const tempSeq = useRef(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(initialAdding);

  const firstOf = (category: Status['category']) =>
    statuses?.find((s) => s.category === category) ?? null;

  function toggleComplete(task: TaskListItem) {
    if (isTempTask(task)) return;
    const done = !isDone(task);
    const target = firstOf(done ? 'done' : 'todo');
    const optimistic = target
      ? {
          status: statusRef(target),
          position: placeInStatus(
            tasks.filter((x) => x.status.id === target.id),
            task.id,
            null,
            null,
          ).position,
        }
      : {
          status: { ...task.status, category: done ? ('done' as const) : ('todo' as const) },
          position: task.position,
        };
    complete.mutate({ task, done, optimistic });
  }

  function createIn(group: TaskGroup, title: string) {
    if (!project || !statuses || !group.defaults) return;
    const defaults = group.defaults;
    const status =
      statuses.find((s) => s.id === defaults.statusId) ?? firstOf('todo') ?? statuses[0];
    if (!status) return;
    const assignees = members
      .filter((m) => defaults.assigneeIds?.includes(m.user.id))
      .map(({ user: { id, name, initials, avatarColor } }) => ({
        id,
        name,
        initials,
        avatarColor,
      }));
    const now = new Date().toISOString();
    tempSeq.current += 1;
    const sprintId = view.sprintId;
    create.mutate({
      body: {
        title,
        statusId: status.id,
        ...(defaults.priority ? { priority: defaults.priority } : {}),
        ...(assignees.length ? { assigneeIds: assignees.map((a) => a.id) } : {}),
        // Keep the new task inside the sprint the list is filtered to.
        ...(sprintId ? { sprintId } : {}),
        position: 'bottom',
      },
      optimistic: {
        id: `temp-${String(tempSeq.current)}`,
        key: `${project.key}-…`,
        number: 0,
        project: {
          id: project.id,
          spaceId: project.spaceId,
          key: project.key,
          name: project.name,
          color: project.color,
        },
        status: statusRef(status),
        title,
        priority: defaults.priority ?? 'none',
        startDate: null,
        dueDate: null,
        position: placeInStatus(
          tasks.filter((x) => x.status.id === status.id),
          '',
          null,
          null,
        ).position,
        sprintId,
        completedAt: status.category === 'done' ? now : null,
        createdAt: now,
        updatedAt: now,
        assignees,
        tags: [],
        subtaskProgress: { done: 0, total: 0 },
        commentCount: 0,
        attachmentCount: 0,
      },
    });
  }

  const { params, update: updateParams } = view;
  const taskHref = useCallback(
    (task: TaskListItem) => {
      const next = new URLSearchParams(params);
      next.set('task', task.key);
      return `?${next.toString()}`;
    },
    [params],
  );

  const actions: ListActions = {
    members,
    teamIds: new Set(project?.members.map((m) => m.user.id) ?? []),
    tags,
    taskHref,
    open: (task) => {
      if (!isTempTask(task)) updateParams({ task: task.key });
    },
    select: (task) => {
      setSelectedId(task.id);
    },
    toggleComplete,
    remove: (task) => {
      if (window.confirm(t('table.deleteConfirm', { name: task.title }))) remove.mutate(task);
    },
    copyLink: (task) => {
      void copy(`${window.location.origin}/t/${task.key}`);
    },
    setAssignees: (task, users) => {
      setAssigneesMutation.mutate({ task, users });
    },
    setDue: (task, dueDate) => {
      if (dueDate !== task.dueDate) update.mutate({ task, patch: { dueDate } });
    },
    setPriority: (task, priority) => {
      if (priority !== task.priority) update.mutate({ task, patch: { priority } });
    },
    setTags: (task, next) => {
      setTagsMutation.mutate({ task, tags: next });
    },
  };

  // ---- Keyboard: j/k move the selection, Enter opens, x toggles complete. ----
  const visibleIds = groups.flatMap((g) => (isOpen(g) ? g.tasks.map((x) => x.id) : []));
  const keyState = useRef({ visibleIds, selectedId, byId, toggleComplete, open: actions.open });
  useEffect(() => {
    keyState.current = { visibleIds, selectedId, byId, toggleComplete, open: actions.open };
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      if (isEditable(event.target)) return;
      const state = keyState.current;
      const ids = state.visibleIds.filter((id) => !id.startsWith('temp-'));
      const index = state.selectedId ? ids.indexOf(state.selectedId) : -1;
      const onRow =
        event.target === document.body ||
        (event.target instanceof HTMLElement && event.target.dataset.taskRow !== undefined);

      if (event.key === 'j' || event.key === 'k') {
        const next =
          index < 0
            ? event.key === 'j'
              ? 0
              : ids.length - 1
            : Math.min(ids.length - 1, Math.max(0, index + (event.key === 'j' ? 1 : -1)));
        const id = ids[next];
        if (!id) return;
        event.preventDefault();
        setSelectedId(id);
        const row = document.querySelector<HTMLElement>(`[data-task-row="${id}"]`);
        row?.focus({ preventScroll: true });
        row?.scrollIntoView({ block: 'nearest' });
        return;
      }
      const task = state.selectedId ? state.byId.get(state.selectedId) : undefined;
      if (!task || !onRow) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        state.open(task);
      } else if (event.key === 'x') {
        event.preventDefault();
        state.toggleComplete(task);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // ---- Drag and drop (project list grouped by status). ----
  const dndEnabled = scope === 'project' && view.group === 'status' && Boolean(statuses);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter opens the task; Space picks a row up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Task ids per group while dragging (rows move between groups as the pointer does). */
  const [dragOrder, setDragOrder] = useState<Record<string, string[]> | null>(null);

  const containerOf = (id: UniqueIdentifier, order: Record<string, string[]>) => {
    const value = String(id);
    if (value.startsWith(GROUP_PREFIX)) return value.slice(GROUP_PREFIX.length);
    return Object.keys(order).find((key) => order[key]?.includes(value)) ?? null;
  };

  const collisionDetection: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    const groupHit = within.find((c) => String(c.id).startsWith(GROUP_PREFIX));
    if (!groupHit || !dragOrder) return closestCenter(args);
    const key = String(groupHit.id).slice(GROUP_PREFIX.length);
    const group = groups.find((g) => g.key === key);
    const ids = group && isOpen(group) ? (dragOrder[key] ?? []) : [];
    const items = args.droppableContainers.filter((c) => ids.includes(String(c.id)));
    if (!items.length) return [groupHit];
    return closestCenter({ ...args, droppableContainers: items });
  };

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(String(active.id));
    setSelectedId(String(active.id));
    setDragOrder(Object.fromEntries(groups.map((g) => [g.key, g.tasks.map((x) => x.id)])));
  }

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragOrder) return;
    const from = containerOf(active.id, dragOrder);
    const to = containerOf(over.id, dragOrder);
    if (!from || !to || from === to) return;
    const id = String(active.id);
    setDragOrder((order) => {
      if (!order) return order;
      const target = (order[to] ?? []).filter((x) => x !== id);
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex >= 0 ? overIndex : target.length, 0, id);
      return { ...order, [from]: (order[from] ?? []).filter((x) => x !== id), [to]: target };
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const order = dragOrder;
    setActiveId(null);
    setDragOrder(null);
    const task = byId.get(String(active.id));
    if (!over || !order || !task) return;
    const key = containerOf(active.id, order);
    const group = groups.find((g) => g.key === key);
    if (!key || !group?.status) return;
    let ids = order[key] ?? [];
    const from = ids.indexOf(task.id);
    const to = ids.indexOf(String(over.id));
    if (from >= 0 && to >= 0 && from !== to) ids = arrayMove(ids, from, to);
    const index = ids.indexOf(task.id);
    const afterId = ids[index - 1] ?? null;
    const beforeId = ids[index + 1] ?? null;

    const sameStatus = task.status.id === group.status.id;
    const original = groups.find((g) => g.key === key)?.tasks.map((x) => x.id) ?? [];
    if (sameStatus && original.join() === ids.join()) return;

    const statusTasks = tasks.filter((x) => x.status.id === group.status?.id);
    const placement = placeInStatus(statusTasks, task.id, afterId, beforeId);
    move.mutate({ task, status: statusRef(group.status), ...placement });
    // The dropped order is a manual order: show it.
    if (view.sort !== 'manual') updateParams({ sort: 'manual' });
  }

  const tasksOf = (g: TaskGroup) =>
    dragOrder
      ? (dragOrder[g.key] ?? []).flatMap((id) => {
          const task = byId.get(id);
          return task ? [task] : [];
        })
      : g.tasks;
  const activeTask = activeId ? byId.get(activeId) : undefined;
  const firstVisible = visibleIds.find((id) => !id.startsWith('temp-'));
  const tabStop = selectedId && visibleIds.includes(selectedId) ? selectedId : firstVisible;

  const showNoMatches = tasks.length === 0 && view.activeFilterCount > 0 && view.group !== 'status';

  return (
    <ListContext.Provider value={actions}>
      <span role="status" className="sr-only">
        {copied ? t('header.linkCopied') : ''}
      </span>
      <div className="overflow-x-auto px-6 pt-2 pb-8">
        <div role="table" aria-label={label} className="min-w-[960px]">
          <div role="rowgroup">
            <div
              role="row"
              className="box-border grid h-9 items-center border-b border-default px-2 text-[12px] font-medium text-muted"
              style={{ gridTemplateColumns: GRID_COLUMNS }}
            >
              <span role="columnheader">
                <span className="sr-only">{t('table.complete')}</span>
              </span>
              <span role="columnheader">{t('table.colName')}</span>
              <span role="columnheader">{t('table.colAssignee')}</span>
              <span role="columnheader">{t('table.colDue')}</span>
              <span role="columnheader">{t('table.colPriority')}</span>
              <span role="columnheader">{t('table.colTags')}</span>
              <span role="columnheader">
                <span className="sr-only">{t('table.actions')}</span>
              </span>
            </div>
          </div>

          {showNoMatches && (
            <p className="m-0 px-2 py-8 text-center text-[13px] text-muted">
              {t('table.noMatches')}
            </p>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={() => {
              setActiveId(null);
              setDragOrder(null);
            }}
          >
            {groups.map((group) => (
              <GroupSection
                key={group.key}
                group={group}
                tasks={tasksOf(group)}
                open={isOpen(group)}
                headless={group.key === 'all'}
                listKey={listKey}
                rowHeight={rowHeight}
                dndEnabled={dndEnabled}
                selectedId={selectedId}
                tabStop={tabStop}
                showProject={scope === 'space'}
                adding={adding === group.key}
                onToggle={() => {
                  setGroupCollapsed(listKey, group.key, isOpen(group));
                }}
                onStartAdd={() => {
                  if (!isOpen(group)) setGroupCollapsed(listKey, group.key, false);
                  setAdding(group.key);
                }}
                onCancelAdd={() => {
                  setAdding((current) => (current === group.key ? null : current));
                }}
                onSubmitAdd={(title) => {
                  createIn(group, title);
                }}
              />
            ))}
            <DragOverlay dropAnimation={null}>
              {activeTask && <TaskRow task={activeTask} height={rowHeight} dragState="overlay" />}
            </DragOverlay>
          </DndContext>
        </div>
      </div>
    </ListContext.Provider>
  );
}

interface GroupSectionProps {
  group: TaskGroup;
  tasks: TaskListItem[];
  open: boolean;
  /** Group: None — a single list without a header. */
  headless: boolean;
  listKey: string;
  rowHeight: number;
  dndEnabled: boolean;
  selectedId: string | null;
  tabStop: string | undefined;
  showProject: boolean;
  adding: boolean;
  onToggle: () => void;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  onSubmitAdd: (title: string) => void;
}

function GroupSection({
  group,
  tasks,
  open,
  headless,
  listKey,
  rowHeight,
  dndEnabled,
  selectedId,
  tabStop,
  showProject,
  adding,
  onToggle,
  onStartAdd,
  onCancelAdd,
  onSubmitAdd,
}: GroupSectionProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `${GROUP_PREFIX}${group.key}`, disabled: !dndEnabled });
  const label = group.name ?? (group.labelKey ? t(group.labelKey) : '');
  const bodyId = `${listKey}-${group.key}`;
  const canAdd = group.defaults !== null;

  return (
    <div
      ref={setNodeRef}
      role="rowgroup"
      aria-label={label || undefined}
      className="flex flex-col pt-4"
    >
      {!headless && (
        <GroupHeader
          label={label}
          count={group.tasks.length}
          marker={group.marker}
          open={open}
          onToggle={onToggle}
          onAdd={canAdd ? onStartAdd : undefined}
          bodyId={bodyId}
        />
      )}
      {open && (
        <div id={bodyId} className="flex flex-col border-t border-subtle">
          <SortableContext
            items={tasks.map((task) => task.id)}
            strategy={verticalListSortingStrategy}
            disabled={!dndEnabled}
          >
            {tasks.map((task) => (
              <SortableTaskRow
                key={task.id}
                task={task}
                height={rowHeight}
                disabled={!dndEnabled || isTempTask(task)}
                selected={task.id === selectedId}
                tabbable={task.id === tabStop}
                showProject={showProject}
              />
            ))}
          </SortableContext>
          {canAdd && (
            <AddTaskRow
              active={adding}
              onStart={onStartAdd}
              onCancel={onCancelAdd}
              onSubmit={onSubmitAdd}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface SortableTaskRowProps {
  task: TaskListItem;
  height: number;
  disabled: boolean;
  selected: boolean;
  tabbable: boolean;
  showProject: boolean;
}

type Listener<E> = ((event: E) => void) | undefined;

function SortableTaskRow({ task, disabled, ...rowProps }: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, disabled });
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      setActivatorNodeRef(node);
    },
    [setNodeRef, setActivatorNodeRef],
  );
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLDivElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLDivElement>>;

  return (
    <TaskRow
      {...rowProps}
      task={task}
      rowRef={ref}
      dragState={isDragging ? 'source' : undefined}
      rowProps={{
        'aria-roledescription': disabled ? undefined : attributes['aria-roledescription'],
        'aria-describedby': disabled ? undefined : attributes['aria-describedby'],
        // Pointer-downs inside portalled pickers bubble here through React; ignore them.
        onPointerDown: (e) => {
          if (e.currentTarget.contains(e.target as Node)) onPointerDown?.(e);
        },
        onKeyDown,
        style: { transform: CSS.Translate.toString(transform), transition },
      }}
    />
  );
}
