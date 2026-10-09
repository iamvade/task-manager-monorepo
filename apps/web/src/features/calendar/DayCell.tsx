import { useDroppable } from '@dnd-kit/core';
import type { OffsetOptions } from '@floating-ui/react';
import type { TaskListItem } from '@kite/shared';
import { weekdayIndex } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseIcon, PlusIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Popover } from '../../components/ui/Popover';
import { cn } from '../../lib/cn';
import { useDates, WEEKDAYS } from '../../lib/useDates';
import { dayId } from './calendarDrag';
import { visiblePills, type CalendarDay } from './calendarGrid';
import { DraggablePill, Pill } from './CalendarPill';

export interface DayProps {
  day: CalendarDay;
  tasks: readonly TaskListItem[];
  taskHref: (task: TaskListItem) => string;
  /** Title of the dragged task while this day is the drop target. */
  dropLabel: string | null;
}

/** The day number: 24px (week header 26px); today = accent circle; "Oct 1" on the 1st. */
function DayNumber({ day, size }: { day: CalendarDay; size: 24 | 26 }) {
  const dates = useDates();
  const d = Number(day.date.slice(8));
  const today = day.date === dates.today;
  return (
    <span
      className={cn(
        'box-border flex items-center justify-center rounded-full px-1 whitespace-nowrap',
        size === 24
          ? 'h-6 min-w-6 text-[12px] font-medium'
          : 'h-[26px] min-w-[26px] text-[14px] font-semibold',
        today ? 'bg-accent font-semibold text-white' : day.inPeriod ? 'text-2' : 'text-faint',
      )}
    >
      {d === 1 ? dates.formatDay('dateShort', day.date) : d}
    </span>
  );
}

/** "Thursday, Oct 8, 3 tasks" (cell / column name). */
function useDayLabel(day: CalendarDay, count: number) {
  const { t } = useTranslation();
  const dates = useDates();
  return t('calendar.dayLabel', { date: dates.formatDay('weekdayLongDate', day.date), count });
}

const dropTargetClass = 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent-ink)]';

function cellBackground(day: CalendarDay, target: boolean) {
  if (target) return dropTargetClass;
  if (!day.inPeriod) return 'bg-subtle';
  return day.weekend ? 'bg-calendar-weekend' : 'bg-default';
}

/** Dashed pill/card showing where the dragged task lands. */
function DropGhost({ label, variant }: { label: string; variant: 'month' | 'week' }) {
  return variant === 'month' ? (
    <div className="box-border flex h-[22px] flex-none items-center gap-1.5 overflow-hidden rounded-[6px] border border-dashed border-accent-ink bg-surface px-1.5 text-[12px] font-medium whitespace-nowrap text-accent-ink">
      <PlusIcon size={12} strokeWidth={2.5} className="flex-none" />
      <span className="truncate">{label}</span>
    </div>
  ) : (
    <div className="rounded-[8px] border border-dashed border-accent-ink p-2 text-[12px] font-medium text-accent-ink">
      {label}
    </div>
  );
}

/** The day popover covers its cell: 4px up/left of the cell's corner (Calendar.dc.html). */
const overCell: OffsetOptions = ({ elements }) => {
  const reference = elements.reference;
  const cell = reference instanceof Element ? reference.closest('[data-date]') : null;
  if (!cell) return 4;
  const c = cell.getBoundingClientRect();
  const r = reference.getBoundingClientRect();
  return { mainAxis: c.top - r.bottom - 4, crossAxis: c.left - r.left - 4 };
};

/** "+N more" → popover with every task of the day (26px pills with the project name). */
function MorePopover({
  day,
  tasks,
  more,
  taskHref,
}: Omit<DayProps, 'dropLabel'> & { more: number }) {
  const { t } = useTranslation();
  const dates = useDates();
  const [width, setWidth] = useState(240);
  const label = dates.formatDay('weekdayLongDate', day.date);
  const dayLabel = useDayLabel(day, tasks.length);
  return (
    <Popover
      label={dayLabel}
      placement="bottom-start"
      offset={overCell}
      elevation="lg"
      width={width}
      initialFocus={-1}
      onOpenChange={(open) => {
        if (!open) return;
        const cell = document.querySelector(`[data-date="${day.date}"]`);
        setWidth(Math.max(240, (cell?.getBoundingClientRect().width ?? 0) + 96));
      }}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className="h-[22px] flex-none self-start rounded-[6px] border-0 bg-transparent px-1.5 text-[12px] font-semibold text-2 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]"
        >
          {t('calendar.more', { count: more })}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-1 p-1">
          <div className="flex items-center justify-between px-0.5 pb-1">
            <span className="text-[13px] font-semibold">{label}</span>
            <IconButton
              label={t('calendar.closePopover')}
              size={24}
              icon={<CloseIcon size={12} strokeWidth={2.5} />}
              onClick={close}
            />
          </div>
          {tasks.map((task) => (
            <Pill
              key={task.id}
              task={task}
              variant="popover"
              href={taskHref(task)}
              onClick={close}
            />
          ))}
        </div>
      )}
    </Popover>
  );
}

/**
 * Month cell (min 128px): day number, up to 3 pills (more → 2 + "+N more"), and while a drag is
 * over it the accent-soft fill, inset accent ring and a dashed pill with the dragged title.
 */
export function MonthDay({ day, tasks, taskHref, dropLabel }: DayProps) {
  const { setNodeRef } = useDroppable({ id: dayId(day.date) });
  const label = useDayLabel(day, tasks.length);
  const { shown, more } = visiblePills(tasks);
  return (
    <div
      ref={setNodeRef}
      role="group"
      data-date={day.date}
      aria-label={label}
      className={cn(
        'relative box-border flex min-h-32 min-w-0 flex-col gap-[3px] border-r border-b border-subtle p-1.5 nth-[7n]:border-r-0',
        cellBackground(day, dropLabel !== null),
      )}
    >
      <div className="flex h-6 items-center justify-between px-0.5">
        <DayNumber day={day} size={24} />
      </div>
      {shown.map((task) => (
        <DraggablePill key={task.id} task={task} variant="month" href={taskHref(task)} />
      ))}
      {dropLabel !== null && <DropGhost label={dropLabel} variant="month" />}
      {more > 0 && <MorePopover day={day} tasks={tasks} more={more} taskHref={taskHref} />}
    </div>
  );
}

/** Week column (min 620px): weekday + 26px number header, every task stacked. */
export function WeekDay({ day, tasks, taskHref, dropLabel }: DayProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: dayId(day.date) });
  const label = useDayLabel(day, tasks.length);
  const weekday = WEEKDAYS[weekdayIndex(day.date)] ?? 'mon';
  return (
    <div
      ref={setNodeRef}
      role="group"
      data-date={day.date}
      aria-label={label}
      className={cn(
        'flex min-h-[620px] min-w-0 flex-col border-r border-subtle last:border-r-0',
        cellBackground(day, dropLabel !== null),
      )}
    >
      <div className="flex h-11 flex-none items-center gap-2 border-b border-subtle px-2.5">
        <span className="text-[12px] font-medium text-muted">
          {t(`calendar.weekdays.short.${weekday}`)}
        </span>
        <DayNumber day={day} size={26} />
      </div>
      <div className="flex flex-col gap-1.5 p-2">
        {tasks.map((task) => (
          <DraggablePill key={task.id} task={task} variant="week" href={taskHref(task)} />
        ))}
        {dropLabel !== null && <DropGhost label={dropLabel} variant="week" />}
      </div>
    </div>
  );
}
