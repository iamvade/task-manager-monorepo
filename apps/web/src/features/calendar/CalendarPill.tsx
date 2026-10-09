import { useDraggable } from '@dnd-kit/core';
import type { TaskListItem } from '@kite/shared';
import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isTempTask } from '../../api/tasks';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { cn } from '../../lib/cn';
import { paletteClass } from '../../lib/palette';
import { isDone } from './calendarGrid';

/** month: 22px pill · popover: 26px with the project name · week: stacked card. */
export type PillVariant = 'month' | 'popover' | 'week';

/** idle · ghost = the spot a dragged pill left (50%, dashed accent) · overlay = lifted copy. */
export type PillState = 'idle' | 'ghost' | 'overlay';

interface PillProps extends HTMLAttributes<HTMLElement> {
  task: TaskListItem;
  variant: PillVariant;
  /** `?…&task=KEY` (opens the drawer); none on the drag overlay. */
  href?: string;
  state?: PillState;
}

/** Assignee initials for the week card ("AB", "AB +1"). */
function who(task: TaskListItem) {
  const [first] = task.assignees;
  if (!first) return '';
  const rest = task.assignees.length - 1;
  return rest > 0 ? `${first.initials} +${String(rest)}` : first.initials;
}

/**
 * A task on the calendar (Calendar.dc.html) in its project's colors: 6px dot + title, ellipsis;
 * done → strike-through at 65%. Links to the drawer.
 */
export const Pill = forwardRef<HTMLElement, PillProps>(function Pill(
  { task, variant, href, state = 'idle', className, ...props },
  ref,
) {
  const { t } = useTranslation();
  const done = isDone(task);
  const title = (
    <span
      className={cn(
        variant === 'week' ? 'text-[12px] leading-4 font-medium' : 'min-w-0 truncate',
        variant === 'popover' && 'flex-1',
        done && 'line-through opacity-65',
      )}
    >
      {task.title}
    </span>
  );
  const body =
    variant === 'week' ? (
      <>
        {title}
        <span className="flex items-center gap-1.5 text-[11px] leading-4 opacity-85">
          <ProjectDot color={task.project.color} />
          <span className="min-w-0 truncate">{task.project.name}</span>
          <span className="flex-1" />
          <span className="flex-none">{who(task)}</span>
        </span>
      </>
    ) : (
      <>
        <ProjectDot color={task.project.color} />
        {title}
        {variant === 'popover' && (
          <span className="flex-none text-[11px] font-normal opacity-80">{task.project.name}</span>
        )}
      </>
    );
  const classes = cn(
    'pal-fill box-border flex min-w-0 hover:brightness-[0.97]',
    paletteClass('project', task.project.color),
    variant === 'month' &&
      'h-[22px] flex-none items-center gap-1.5 rounded-[6px] px-1.5 text-[12px] font-medium',
    variant === 'popover' &&
      'h-[26px] flex-none items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium',
    variant === 'week' && 'flex-col gap-1 rounded-[8px] p-2',
    state === 'overlay'
      ? 'cursor-grabbing shadow-drag'
      : 'outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]',
    state === 'ghost' && 'opacity-50 outline-1 outline-offset-0 outline-accent outline-dashed',
    className,
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
      title={t('calendar.pillTitle', { title: task.title, project: task.project.name })}
      data-task-pill={task.id}
      className={classes}
      {...props}
    >
      {body}
    </Link>
  );
});

type Listener<E> = ((event: E) => void) | undefined;

/** A pill on the grid that can be dragged to another day or onto Unscheduled. */
export function DraggablePill({
  task,
  variant,
  href,
}: {
  task: TaskListItem;
  variant: 'month' | 'week';
  href: string;
}) {
  const temp = isTempTask(task);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    disabled: temp,
  });
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLElement>>;
  return (
    <Pill
      ref={setNodeRef}
      task={task}
      variant={variant}
      href={temp ? undefined : href}
      state={isDragging ? 'ghost' : 'idle'}
      aria-roledescription={temp ? undefined : attributes['aria-roledescription']}
      aria-describedby={temp ? undefined : attributes['aria-describedby']}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        // Space picks the pill up; Enter follows the link (opens the drawer).
        if (e.target === e.currentTarget) onKeyDown?.(e);
      }}
    />
  );
}
