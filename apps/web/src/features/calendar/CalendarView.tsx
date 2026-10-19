import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import type { ProjectDetail, SidebarSpace, TaskListItem } from '@kite/shared';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOutletContext } from 'react-router';
import {
  useProjectTasks,
  useSpaceTasks,
  useUpdateTask,
  type TaskListParams,
} from '../../api/tasks';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import { useDates, WEEKDAYS } from '../../lib/useDates';
import { useUiStore } from '../../stores/ui';
import { toTaskQuery, type ListScope } from '../views/taskQuery';
import { useViewParams } from '../views/useViewParams';
import {
  dayId,
  dropDue,
  keyTarget,
  pointInside,
  targetOf,
  UNSCHEDULED_ID,
  type CalendarTarget,
} from './calendarDrag';
import { calendarDays, isDone, placeTasks, shiftPeriod } from './calendarGrid';
import { Pill } from './CalendarPill';
import { CalendarToolbar, type CalendarProject } from './CalendarToolbar';
import { MonthDay, WeekDay } from './DayCell';
import { UnscheduledCard, UnscheduledPanel } from './UnscheduledPanel';
import { reportError } from '../../lib/mutationErrors';

const NO_HIDDEN: readonly string[] = [];

/** `/p/:projectId/calendar`. */
export function CalendarView() {
  const project = useOutletContext<ProjectDetail>();
  return <Calendar key={project.id} scope="project" scopeId={project.id} project={project} />;
}

/** `/s/:spaceId/calendar`: every project of the space, with project toggle chips. */
export function SpaceCalendarView() {
  const space = useOutletContext<SidebarSpace>();
  return <Calendar key={space.id} scope="space" scopeId={space.id} space={space} />;
}

/** One of the two list endpoints, by scope (the other query stays disabled). */
function useScopeTasks(scope: ListScope, id: string | undefined, params: TaskListParams) {
  const project = useProjectTasks(scope === 'project' ? id : undefined, params);
  const space = useSpaceTasks(scope === 'space' ? id : undefined, params);
  return scope === 'project' ? project : space;
}

interface CalendarProps {
  scope: ListScope;
  scopeId: string;
  project?: ProjectDetail;
  space?: SidebarSpace;
}

/**
 * Calendar (Calendar.dc.html): month grid (Monday first) or week columns of tasks by due date,
 * plus the Unscheduled panel. Drag a pill to another day (or onto Unscheduled to clear the
 * date), or an unscheduled card onto a day; the change is optimistic and rolls back with a toast.
 */
function Calendar({ scope, scopeId, project, space }: CalendarProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const view = useViewParams();
  const mode = useUiStore((s) => s.calendarMode);
  const setMode = useUiStore((s) => s.setCalendarMode);
  const hidden = useUiStore((s) => (space ? s.calendarHidden[space.id] : undefined)) ?? NO_HIDDEN;
  const toggleProject = useUiStore((s) => s.toggleCalendarProject);
  const openCreate = useUiStore((s) => s.openCreate);
  const [anchor, setAnchor] = useState(dates.today);
  const [filter, setFilter] = useState('');

  const days = useMemo(() => calendarDays(anchor, mode), [anchor, mode]);
  const first = days[0]?.date ?? anchor;
  const last = days.at(-1)?.date ?? anchor;

  // Two queries: tasks due on the visible days (narrowed by a URL due filter) and open tasks
  // without a due date. The URL's due range can't match undated tasks, so Unscheduled ignores it.
  const meId = me?.user.id ?? '';
  const { filters } = view;
  const base = useMemo(() => toTaskQuery(filters, meId, scope), [filters, meId, scope]);
  const rangeQuery = useMemo(() => {
    const { dueFrom, dueTo, ...rest } = base;
    const from = typeof dueFrom === 'string' && dueFrom > first ? dueFrom : first;
    const to = typeof dueTo === 'string' && dueTo < last ? dueTo : last;
    return from > to ? null : { ...rest, dueFrom: from, dueTo: to };
  }, [base, first, last]);
  const unscheduledQuery = useMemo(() => {
    const { dueFrom: _from, dueTo: _to, ...rest } = base;
    return { ...rest, hasDueDate: 'false', includeDone: 'false' };
  }, [base]);
  const range = useScopeTasks(scope, rangeQuery ? scopeId : undefined, rangeQuery ?? {});
  const unscheduledTasks = useScopeTasks(scope, scopeId, unscheduledQuery);

  // Placed by each row's current due date, so an optimistic change moves it at once.
  const { byDay, unscheduled, byId } = useMemo(() => {
    const rows = [
      ...(rangeQuery ? (range.data ?? []) : []),
      ...(unscheduledTasks.data ?? []),
    ].filter((task) => !hidden.includes(task.project.id));
    return { ...placeTasks(rows, days), byId: new Map(rows.map((task) => [task.id, task])) };
  }, [rangeQuery, range.data, unscheduledTasks.data, hidden, days]);

  const projects = useMemo<CalendarProject[]>(
    () => space?.projects.map((p) => ({ id: p.id, name: p.name, color: p.color })) ?? [],
    [space],
  );

  const { params } = view;
  const taskHref = useCallback(
    (task: TaskListItem) => {
      const next = new URLSearchParams(params);
      next.set('task', task.key);
      return `?${next.toString()}`;
    },
    [params],
  );

  // ---- Drag and drop. ----
  const update = useUpdateTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<'grid' | 'unscheduled'>('grid');
  const [target, setTarget] = useState<CalendarTarget | null>(null);
  const targetRef = useRef<CalendarTarget | null>(null);
  const lastDayRef = useRef<string | null>(null);
  const dayDates = useMemo(() => days.map((d) => d.date), [days]);

  const setOver = (next: CalendarTarget | null) => {
    targetRef.current = next;
    if (next?.kind === 'day') lastDayRef.current = next.date;
    setTarget((current) =>
      current?.kind === next?.kind &&
      (current?.kind !== 'day' || next?.kind !== 'day' || current.date === next.date)
        ? current
        : next,
    );
  };

  /**
   * Keyboard drag: the lifted task's center goes to the center of the next day (←/→ a day,
   * ↑/↓ a week) or of the Unscheduled panel, so collision detection reads the same target.
   */
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
    const { active, collisionRect, droppableRects } = context;
    if (!event.code.startsWith('Arrow') || !active || !collisionRect) return undefined;
    event.preventDefault();
    const task = byId.get(String(active.id));
    const current: CalendarTarget =
      targetRef.current ??
      (task?.dueDate && dayDates.includes(task.dueDate)
        ? { kind: 'day', date: task.dueDate }
        : { kind: 'unscheduled' });
    const fallback =
      lastDayRef.current ??
      (dayDates.includes(dates.today)
        ? dates.today
        : (days.find((d) => d.inPeriod)?.date ?? first));
    const next = keyTarget(current, event.code, dayDates, mode, fallback);
    if (!next) return undefined;
    const rect = droppableRects.get(next.kind === 'day' ? dayId(next.date) : UNSCHEDULED_ID);
    if (!rect) return undefined;
    return {
      x: rect.left + rect.width / 2 - collisionRect.width / 2,
      y: rect.top + Math.min(rect.height / 2, 48) - collisionRect.height / 2,
    };
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  function reset() {
    setActiveId(null);
    targetRef.current = null;
    lastDayRef.current = null;
    setTarget(null);
  }

  function onDragEnd({ active }: DragEndEvent) {
    const drop = targetRef.current;
    reset();
    const task = byId.get(String(active.id));
    if (!task) return;
    const dueDate = dropDue(task.dueDate, drop, isDone(task));
    if (dueDate === undefined) return;
    update.mutate(
      { task, patch: { dueDate } },
      {
        onError: (err) => {
          reportError(err, t('calendar.moveFailed'));
        },
      },
    );
  }

  const activeTask = activeId ? byId.get(activeId) : undefined;
  // Only targets where the drop changes something light up.
  const effective =
    activeTask && dropDue(activeTask.dueDate, target, isDone(activeTask)) !== undefined
      ? target
      : null;
  const dropLabelFor = (date: string) =>
    activeTask && effective?.kind === 'day' && effective.date === date ? activeTask.title : null;

  const targetLabel = (over: CalendarTarget | null) =>
    over?.kind === 'day'
      ? dates.formatDay('weekdayLongDate', over.date)
      : over
        ? t('calendar.unscheduled')
        : '';
  const titleOf = (id: string | number) => byId.get(String(id))?.title ?? '';
  const announcements: Announcements = {
    onDragStart: ({ active }) => t('calendar.dnd.picked', { title: titleOf(active.id) }),
    onDragOver: ({ active }) =>
      targetRef.current
        ? t('calendar.dnd.over', {
            title: titleOf(active.id),
            target: targetLabel(targetRef.current),
          })
        : t('calendar.dnd.notOver', { title: titleOf(active.id) }),
    onDragEnd: ({ active }) =>
      targetRef.current
        ? t('calendar.dnd.dropped', {
            title: titleOf(active.id),
            target: targetLabel(targetRef.current),
          })
        : t('calendar.dnd.cancelled', { title: titleOf(active.id) }),
    onDragCancel: ({ active }) => t('calendar.dnd.cancelled', { title: titleOf(active.id) }),
  };

  const error = (rangeQuery ? range.error : null) ?? unscheduledTasks.error;
  if (error) return <ErrorState error={error} />;

  const sprint = view.sprintId ? { sprintId: view.sprintId } : {};

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointInside}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('calendar.dnd.instructions') },
      }}
      onDragStart={({ active }) => {
        setActiveId(String(active.id));
        setActiveSource(active.data.current?.source === 'unscheduled' ? 'unscheduled' : 'grid');
      }}
      onDragOver={({ over }) => {
        setOver(targetOf(over?.id));
      }}
      onDragMove={({ over }) => {
        setOver(targetOf(over?.id));
      }}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div className="flex flex-wrap items-start gap-4 px-6 pt-4 pb-8">
        <section
          aria-label={t('calendar.label')}
          className="flex min-w-0 flex-[999_1_600px] flex-col gap-3"
        >
          <CalendarToolbar
            anchor={anchor}
            mode={mode}
            onModeChange={setMode}
            onToday={() => {
              setAnchor(dates.today);
            }}
            onStep={(step) => {
              setAnchor((a) => shiftPeriod(a, mode, step));
            }}
            projects={projects}
            hidden={hidden}
            onToggleProject={(projectId) => {
              if (space) toggleProject(space.id, projectId);
            }}
          />
          <div className="overflow-x-auto">
            {mode === 'month' ? (
              <div className="min-w-[700px] overflow-hidden rounded-[12px] border border-default">
                <div className="grid grid-cols-7 border-b border-default bg-subtle">
                  {WEEKDAYS.map((weekday) => (
                    <span
                      key={weekday}
                      className="flex h-8 items-center px-2.5 text-[12px] font-medium text-muted"
                    >
                      {t(`calendar.weekdays.short.${weekday}`)}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-7 [&>*:nth-last-child(-n+7)]:border-b-0">
                  {days.map((day) => (
                    <MonthDay
                      key={day.date}
                      day={day}
                      tasks={byDay.get(day.date) ?? []}
                      taskHref={taskHref}
                      dropLabel={dropLabelFor(day.date)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid min-w-[700px] grid-cols-7 overflow-hidden rounded-[12px] border border-default">
                {days.map((day) => (
                  <WeekDay
                    key={day.date}
                    day={day}
                    tasks={byDay.get(day.date) ?? []}
                    taskHref={taskHref}
                    dropLabel={dropLabelFor(day.date)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
        <UnscheduledPanel
          tasks={unscheduled}
          filter={filter}
          onFilterChange={setFilter}
          taskHref={taskHref}
          isTarget={effective?.kind === 'unscheduled'}
          onAdd={() => {
            openCreate(project ? { projectId: project.id, ...sprint } : sprint);
          }}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {activeTask &&
          (activeSource === 'unscheduled' ? (
            <UnscheduledCard task={activeTask} state="overlay" />
          ) : (
            <Pill task={activeTask} variant={mode} state="overlay" />
          ))}
      </DragOverlay>
    </DndContext>
  );
}
