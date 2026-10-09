import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { TaskListItem } from '@kite/shared';
import {
  forwardRef,
  useId,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isTempTask } from '../../api/tasks';
import { DragHintIcon, GripIcon, PlusIcon, SearchIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { cn } from '../../lib/cn';
import { UNSCHEDULED_ID } from './calendarDrag';

interface CardProps extends HTMLAttributes<HTMLElement> {
  task: TaskListItem;
  href?: string;
  state?: 'idle' | 'ghost' | 'overlay';
}

/** Unscheduled card: grip, title 13/500, project dot + name, priority flag. */
export const UnscheduledCard = forwardRef<HTMLElement, CardProps>(function UnscheduledCard(
  { task, href, state = 'idle', className, ...props },
  ref,
) {
  const { t } = useTranslation();
  const classes = cn(
    'box-border flex items-start gap-2 rounded-[10px] border bg-surface py-2.5 pr-2.5 pl-1.5 text-default',
    state === 'idle' &&
      'cursor-grab border-default outline-none hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]',
    state === 'ghost' && 'border-dashed border-accent-ink opacity-50',
    state === 'overlay' && 'cursor-grabbing border-default shadow-drag',
    className,
  );
  const body = (
    <>
      <GripIcon size={14} className="mt-[3px] flex-none text-faint" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[13px] leading-[18px] font-medium">{task.title}</span>
        <span className="flex items-center gap-1.5 text-[12px] text-3">
          <ProjectDot color={task.project.color} size={8} />
          <span className="min-w-0 flex-1 truncate">{task.project.name}</span>
          <PriorityFlag priority={task.priority} size={12} />
        </span>
      </span>
    </>
  );
  if (!href || state === 'overlay') {
    return (
      <div ref={ref as Ref<HTMLDivElement>} className={classes} {...props}>
        {body}
      </div>
    );
  }
  return (
    <Link
      ref={ref as Ref<HTMLAnchorElement>}
      to={href}
      data-task-card={task.id}
      aria-label={t('calendar.unscheduledCard', {
        title: task.title,
        project: task.project.name,
        priority: t(`priority.${task.priority}`),
      })}
      className={classes}
      {...props}
    >
      {body}
    </Link>
  );
});

type Listener<E> = ((event: E) => void) | undefined;

function DraggableCard({ task, href }: { task: TaskListItem; href: string }) {
  const temp = isTempTask(task);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { source: 'unscheduled' },
    disabled: temp,
  });
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLElement>>;
  return (
    <UnscheduledCard
      ref={setNodeRef}
      task={task}
      href={temp ? undefined : href}
      state={isDragging ? 'ghost' : 'idle'}
      aria-roledescription={temp ? undefined : attributes['aria-roledescription']}
      aria-describedby={temp ? undefined : attributes['aria-describedby']}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget) onKeyDown?.(e);
      }}
    />
  );
}

interface UnscheduledPanelProps {
  /** Open tasks without a due date (hidden projects already left out). */
  tasks: readonly TaskListItem[];
  filter: string;
  onFilterChange: (value: string) => void;
  taskHref: (task: TaskListItem) => string;
  onAdd: () => void;
  /** A dated task is dragged over the panel: dropping clears its date. */
  isTarget: boolean;
}

/**
 * Right panel (Calendar.dc.html): title + count, "+", filter input, drag hint, draggable cards;
 * "Everything is scheduled." when empty. Dropping a pill here clears its due date.
 */
export function UnscheduledPanel({
  tasks,
  filter,
  onFilterChange,
  taskHref,
  onAdd,
  isTarget,
}: UnscheduledPanelProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const { setNodeRef } = useDroppable({ id: UNSCHEDULED_ID });
  const query = filter.trim().toLocaleLowerCase();
  const shown = query
    ? tasks.filter((task) => task.title.toLocaleLowerCase().includes(query))
    : tasks;

  return (
    <aside
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={cn(
        'box-border flex max-w-72 min-w-0 flex-[1_1_260px] flex-col gap-3 rounded-[12px] border border-subtle p-3',
        isTarget ? 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--accent-ink)]' : 'bg-sidebar',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="m-0 flex items-center gap-2 text-[14px] font-semibold">
          {t('calendar.unscheduled')}
          <span className="box-border flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[12px] font-medium text-3">
            {tasks.length}
          </span>
        </h2>
        <IconButton
          label={t('calendar.addUnscheduled')}
          icon={<PlusIcon size={14} />}
          onClick={onAdd}
        />
      </div>
      <label className="flex h-8 items-center gap-2 rounded-[8px] border border-control bg-control px-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--accent-ink)]">
        <SearchIcon size={14} className="flex-none text-icon" />
        <span className="sr-only">{t('calendar.filterUnscheduled')}</span>
        <input
          type="search"
          value={filter}
          placeholder={t('calendar.filterPlaceholder')}
          onChange={(e) => {
            onFilterChange(e.target.value);
          }}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] text-default outline-none placeholder:text-faint"
        />
      </label>
      <p className="m-0 flex items-center gap-1.5 text-[12px] text-muted">
        <DragHintIcon size={14} className="flex-none" />
        {t('calendar.dragHint')}
      </p>
      <div className="flex flex-col gap-1.5">
        {shown.map((task) => (
          <DraggableCard key={task.id} task={task} href={taskHref(task)} />
        ))}
        {shown.length === 0 && (
          <p className="m-0 px-2 py-4 text-center text-[13px] text-muted">
            {tasks.length === 0 ? t('calendar.allScheduled') : t('common.noResults')}
          </p>
        )}
      </div>
    </aside>
  );
}
