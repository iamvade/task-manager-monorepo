import type { MyTask, TaskStatusRef } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import type { SectionId } from '../../api/homeCache';
import { Avatar } from '../../components/ui/Avatar';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { cn } from '../../lib/cn';
import { DUE_TONE_CLASS, type DueTone } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { StatusButton } from '../pickers/StatusButton';

/** Due date color per section (MyTasks.dc.html): the section decides, not the date. */
const SECTION_TONE: Record<SectionId, DueTone> = {
  overdue: 'overdue',
  today: 'today',
  thisWeek: 'soon',
  later: 'later',
  done: 'done',
  requested: 'later',
};

interface MyTaskRowProps {
  task: MyTask;
  section: SectionId;
  onStatusChange: (task: MyTask, status: TaskStatusRef) => void;
}

/**
 * One My Tasks row, 44px: status marker (like the List, in place of the design's checkbox) ·
 * title (opens the drawer) · space badge + project · due · priority. A completed row stays in
 * place, struck through.
 */
export function MyTaskRow({ task, section, onStatusChange }: MyTaskRowProps) {
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
        <StatusButton
          status={task.status}
          projectId={task.project.id}
          label={t('table.setStatus', {
            name: task.title,
            status: task.status.name ?? t(`status.${task.status.category}`),
          })}
          onChange={({ id, name, category, color }) => {
            onStatusChange(task, { id, name, category, color });
          }}
        />
      </span>
      <span role="cell" className="flex min-w-0 pr-4">
        <Link
          to={{ search: `?task=${task.key}` }}
          data-task-key={task.key}
          className={cn(
            'truncate text-[14px] no-underline',
            task.done ? 'text-muted line-through' : 'text-default hover:text-default',
          )}
        >
          {task.title}
        </Link>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5 text-[12px] text-3">
        {section === 'requested' && task.assignees.length > 0 && (
          <span
            className="flex flex-none items-center"
            title={task.assignees.map((u) => u.name).join(', ')}
          >
            {task.assignees.slice(0, 2).map((u, i) => (
              <Avatar
                key={u.id}
                user={u}
                size={20}
                title={null}
                ring={i > 0}
                className={i > 0 ? '-ml-1.5' : undefined}
              />
            ))}
          </span>
        )}
        <SpaceBadge initial={task.space.initial} color={task.space.color} size={16} />
        <Link
          to={`/p/${task.project.id}/list`}
          className="truncate text-3 no-underline hover:text-default hover:underline"
        >
          {task.project.name}
        </Link>
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
