import type { MyTask } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SectionId } from '../../api/homeCache';
import { Checkbox } from '../../components/ui/Checkbox';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { cn } from '../../lib/cn';
import { DUE_TONE_CLASS, type DueTone } from '../../lib/dates';
import { useDates } from '../../lib/useDates';

/** Due date color per section (MyTasks.dc.html): the section decides, not the date. */
const SECTION_TONE: Record<SectionId, DueTone> = {
  overdue: 'overdue',
  today: 'today',
  thisWeek: 'soon',
  later: 'later',
};

interface MyTaskRowProps {
  task: MyTask;
  section: SectionId;
  onToggle: (task: MyTask, done: boolean) => void;
}

/**
 * One My Tasks row, 44px: checkbox · title (opens the drawer) · space badge + project · due ·
 * priority. A completed row stays in place, struck through.
 */
export function MyTaskRow({ task, section, onToggle }: MyTaskRowProps) {
  const { t } = useTranslation();
  const dates = useDates();

  const due = (date: string) => {
    if (section === 'today') return t('dates.today');
    if (section === 'thisWeek') return dates.formatDay('weekdayShortDate', date);
    return dates.formatDate(date);
  };

  return (
    <div
      role="row"
      className="grid h-11 grid-cols-[32px_minmax(0,1fr)_168px_100px_88px] items-center border-b border-subtle pr-2 hover:bg-subtle"
    >
      <span role="cell" className="flex justify-center">
        <Checkbox
          checked={task.done}
          onChange={(done) => {
            onToggle(task, done);
          }}
          label={t('table.markComplete', { name: task.title })}
        />
      </span>
      <span role="cell" className="flex min-w-0 pr-4">
        <Link
          to={{ search: `?task=${task.key}` }}
          className={cn(
            'truncate text-[14px] no-underline',
            task.done ? 'text-faint line-through' : 'text-default hover:text-default',
          )}
        >
          {task.title}
        </Link>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[12px] text-3">
        <SpaceBadge initial={task.space.initial} color={task.space.color} size={16} />
        <span className="truncate">{task.project.name}</span>
      </span>
      <span
        role="cell"
        className={cn(
          'truncate text-[13px]',
          DUE_TONE_CLASS[task.done ? 'done' : SECTION_TONE[section]],
        )}
      >
        {task.dueDate && due(task.dueDate)}
      </span>
      <span role="cell" className="flex min-w-0">
        {task.priority !== 'none' && <PriorityFlag priority={task.priority} showLabel />}
      </span>
    </div>
  );
}
