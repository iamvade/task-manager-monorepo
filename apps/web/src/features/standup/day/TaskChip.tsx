import type { StandupTaskRef } from '@kite/shared';
import { Link } from 'react-router';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { cn } from '../../../lib/cn';
import { useTaskKeyHref } from '../../task/useTaskKeyHref';

/**
 * A linked task (Standup.dc.html): outline chip with the project dot and the title; opens the
 * task drawer. `size="lg"` is the Blockers section's 24px chip, `xl` live mode's 26px one,
 * otherwise the 22px card chip.
 */
export function TaskChip({
  task,
  size = 'sm',
}: {
  task: StandupTaskRef;
  size?: 'sm' | 'lg' | 'xl';
}) {
  const href = useTaskKeyHref()(task.key);
  const className = cn(
    'inline-flex min-w-0 items-center gap-1.5 rounded-[6px] border border-default bg-surface no-underline',
    size === 'xl'
      ? 'h-[26px] max-w-full px-2 text-[13px] text-2'
      : size === 'lg'
        ? 'h-6 max-w-[320px] px-2 text-[12px] text-default'
        : 'h-[22px] max-w-[260px] px-[7px] text-[12px] text-2',
    href && 'hover:border-strong hover:bg-subtle',
  );
  const body = (
    <>
      <ProjectDot color={task.project.color} size={size === 'lg' ? 8 : 7} />
      <span className="truncate">{task.title}</span>
    </>
  );
  if (!href) return <span className={className}>{body}</span>;
  return (
    <Link
      to={href}
      data-task-key={task.key}
      title={`${task.key} · ${task.title}`}
      className={className}
    >
      {body}
    </Link>
  );
}
