import type { TaskListItem } from '@kite/shared';
import { forwardRef, type HTMLAttributes, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { CalendarIcon, DoneCircleIcon, SubtaskIcon } from '../../components/icons';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { TagChip } from '../../components/ui/TagChip';
import { cn } from '../../lib/cn';
import { useDates } from '../../lib/useDates';

const MAX_TAGS = 2;

export type CardState = 'idle' | 'ghost' | 'overlay';

interface TaskCardProps extends HTMLAttributes<HTMLElement> {
  task: TaskListItem;
  /** `?…&task=KEY` (opens the drawer); none on the drag overlay. */
  href?: string;
  state?: CardState;
  /** Space board: the task's project above the title. */
  showProject?: boolean;
}

/** Due line tones on the Board: overdue 600 + "· Overdue", today 500, done muted. */
function DueLine({ date, done }: { date: string; done: boolean }) {
  const { t } = useTranslation();
  const dates = useDates();
  const tone = dates.dueTone(date, done);
  const label = dates.formatDue(date);
  return (
    <span
      className={cn(
        'flex items-center gap-1 whitespace-nowrap',
        tone === 'overdue' && 'font-semibold text-due-overdue',
        tone === 'today' && 'font-medium text-due-today',
        tone === 'done' && 'text-muted',
      )}
    >
      <CalendarIcon size={13} />
      {tone === 'overdue' ? t('board.dueOverdue', { date: label }) : label}
    </span>
  );
}

/**
 * Board card (Board.dc.html): radius 10, padding 12, gap 10, hover border #D4D4D8. Done →
 * green check + muted title (no strike-through); up to 2 tags + "+N"; footer with due,
 * "2/5" subtasks + 32px bar and the assignee stack. `ghost` = the spot a dragged card left
 * (40%, dashed); `overlay` = the lifted card under the pointer (rotated 2.5°, accent border).
 */
export const TaskCard = forwardRef<HTMLElement, TaskCardProps>(function TaskCard(
  { task, href, state = 'idle', showProject, className, ...props },
  ref,
) {
  const { t } = useTranslation();
  const done = task.status.category === 'done';
  const shownTags = task.tags.slice(0, MAX_TAGS);
  const moreTags = task.tags.length - shownTags.length;
  const { done: subDone, total: subTotal } = task.subtaskProgress;

  const body = (
    <>
      {showProject && (
        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted">
          <ProjectDot color={task.project.color} size={8} />
          <span className="truncate">{task.project.name}</span>
        </span>
      )}
      <span className="flex items-start gap-2">
        {done && (
          <DoneCircleIcon
            size={16}
            role="img"
            aria-label={t('board.completed')}
            aria-hidden={undefined}
            className="mt-0.5 flex-none text-success"
          />
        )}
        <span
          className={cn('min-w-0 flex-1 text-[14px] leading-5 font-medium', done && 'text-muted')}
        >
          {task.title}
        </span>
        <span className="mt-[3px] flex flex-none">
          <PriorityFlag
            priority={task.priority}
            label={t('board.priorityLabel', { priority: t(`priority.${task.priority}`) })}
          />
        </span>
      </span>
      {task.tags.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {shownTags.map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
          {moreTags > 0 && (
            <span className="flex h-[22px] items-center rounded-[6px] bg-chip px-1.5 text-[12px] font-medium text-chip">
              {t('board.moreTags', { count: moreTags })}
            </span>
          )}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-3">
        {task.dueDate && <DueLine date={task.dueDate} done={done} />}
        {subTotal > 0 && (
          <span
            className="flex items-center gap-1.5"
            aria-label={t('board.subtasksDone', { done: subDone, count: subTotal })}
          >
            <SubtaskIcon size={13} />
            <span aria-hidden="true">
              {subDone}/{subTotal}
            </span>
            <ProgressBar done={subDone} total={subTotal} width={32} />
          </span>
        )}
        {task.assignees.length > 0 && (
          <span className="ml-auto flex">
            <AvatarStack
              users={task.assignees}
              size={24}
              max={3}
              ring="surface"
              label={task.assignees.map((u) => u.name).join(', ')}
            />
          </span>
        )}
      </span>
    </>
  );

  const classes = cn(
    'box-border flex flex-col gap-2.5 rounded-[10px] border bg-surface p-3 text-default outline-none',
    state === 'idle' &&
      'border-default hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent-ink)]',
    state === 'ghost' && 'border-dashed border-default opacity-40 shadow-none',
    state === 'overlay' && 'rotate-[2.5deg] cursor-grabbing border-accent shadow-drag',
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
      data-task-card={task.id}
      className={classes}
      {...props}
    >
      {body}
    </Link>
  );
});
