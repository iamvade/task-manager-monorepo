import {
  type UserRef,
  type WorkloadPerson,
  type WorkloadTask,
  type WorkspaceMember,
} from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { PersonIcon, PlusIcon } from '../../../components/icons';
import { PriorityFlag } from '../../../components/ui/PriorityFlag';
import { ProjectDot } from '../../../components/ui/ProjectDot';
import { AssigneePicker } from '../../pickers/AssigneePicker';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { BUCKET_TEXT, bucketSwatch } from './buckets';

interface PersonTasksProps {
  person: WorkloadPerson;
  members: readonly WorkspaceMember[];
  onReassign: (task: WorkloadTask, users: UserRef[]) => void;
  onAssignWork: () => void;
}

const GRID = 'grid grid-cols-[16px_minmax(0,1fr)_168px_120px_56px_28px] items-center gap-x-3';

/**
 * An expanded Workload row (ReportsWorkload.dc.html): the person's open tasks in an inset card,
 * each opening the drawer, with an assignee picker to hand it to someone else; the footer says
 * how far from capacity they are and "+ Assign work" opens quick create for them.
 */
export function PersonTasks({ person, members, onReassign, onAssignWork }: PersonTasksProps) {
  const { t } = useTranslation();
  const { formatDue } = useDates();
  const { pathname, search } = useLocation();
  const k = 'reports.workload';
  // Against the load (counted points), like the pill.
  const diff = person.loadPoints - person.capacity;

  const taskHref = (key: string) => {
    const params = new URLSearchParams(search);
    params.set('task', key);
    return { pathname, search: `?${params.toString()}` };
  };

  return (
    <div className="bg-subtle px-5 pb-4 pl-[60px]">
      <div className="flex flex-col overflow-hidden rounded-[10px] border border-subtle bg-surface">
        {person.tasks.length === 0 && (
          <p className="m-0 border-b border-[var(--surface-2)] px-3.5 py-3 text-[13px] text-muted">
            {t(`${k}.noTasks`)}
          </p>
        )}
        {person.tasks.map((task) => (
          <div
            key={task.id}
            className={`${GRID} relative h-10 border-b border-[var(--surface-2)] px-3.5 text-[13px] text-default hover:bg-subtle`}
          >
            <PriorityFlag priority={task.priority} />
            <Link
              to={taskHref(task.key)}
              className="min-w-0 truncate rounded-[4px] text-default after:absolute after:inset-0 focus-visible:-outline-offset-2"
            >
              <span className="sr-only">{task.key} </span>
              <span>{task.title}</span>{' '}
              <span className="text-muted">· {t(`priority.${task.priority}`)}</span>
            </Link>
            <span className="flex min-w-0 items-center gap-1.5 text-3">
              <ProjectDot color={task.project.color} size={8} />
              <span className="truncate">{task.project.name}</span>
            </span>
            <span
              className={cn(
                'flex items-center gap-1.5 whitespace-nowrap',
                BUCKET_TEXT[task.bucket],
              )}
            >
              <span
                aria-hidden="true"
                className="box-border size-2 flex-none rounded-[2px]"
                style={bucketSwatch(task.bucket)}
              />
              {task.dueDate ? formatDue(task.dueDate) : t(`${k}.buckets.none`)}
              {!task.counted && (
                <span className="font-normal text-muted" title={t(`${k}.outsideHint`)}>
                  · {t(`${k}.notCounted`)}
                </span>
              )}
            </span>
            <span
              title={task.size ? t(`${k}.sizeTitle`) : t(`${k}.noSize`)}
              className={cn(
                'box-border flex h-5 min-w-5 items-center justify-center justify-self-end rounded-[10px] bg-chip px-1.5 text-[12px] font-medium',
                task.size ? 'text-2' : 'text-muted',
              )}
            >
              {task.size ? task.points : '—'}
            </span>
            <AssigneePicker
              value={task.assignees}
              members={members}
              label={t(`${k}.assignees`)}
              onChange={(users) => {
                onReassign(task, users);
              }}
              trigger={(props, open) => (
                <button
                  type="button"
                  {...props}
                  aria-label={t(`${k}.reassign`, { key: task.key })}
                  aria-expanded={open}
                  title={t(`${k}.reassign`, { key: task.key })}
                  className={cn(
                    'relative z-[1] flex size-6 items-center justify-center justify-self-end rounded-[6px] text-icon hover:bg-hover hover:text-2',
                    open && 'bg-hover text-2',
                  )}
                >
                  <PersonIcon size={14} />
                </button>
              )}
            />
          </div>
        ))}
        <div className="flex items-center justify-between gap-2 px-3.5 py-2">
          <span className="text-[12px] text-muted">
            {diff > 0 ? t(`${k}.over`, { count: diff }) : t(`${k}.room`, { count: -diff })}
          </span>
          <button
            type="button"
            onClick={onAssignWork}
            className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-control bg-control px-2.5 text-[12px] font-medium text-2 hover:bg-hover"
          >
            <PlusIcon size={12} strokeWidth={2.5} />
            {t(`${k}.assign`)}
          </button>
        </div>
      </div>
    </div>
  );
}
