import { shortName, type Status, type StatusCategory, type UserRef } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useSidebar } from '../../api/workspaces';
import { useMoveTaskToProject, useSetAssignees, useSetTags, useUpdateTask } from '../../api/tasks';
import {
  CalendarIcon,
  ChevronDownIcon,
  FlagIcon,
  FolderIcon,
  PersonIcon,
  PlusIcon,
  SprintIcon,
  StatusIcon,
  TagIcon,
} from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import type { TriggerProps } from '../../components/ui/Popover';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { StatusDot } from '../../components/ui/StatusDot';
import { TagChip } from '../../components/ui/TagChip';
import { cn } from '../../lib/cn';
import { DUE_TONE_CLASS, relativeDay } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { DuePicker } from '../pickers/DuePicker';
import { PriorityPicker } from '../pickers/PriorityPicker';
import { ProjectPicker } from '../pickers/ProjectPicker';
import { SprintPicker } from '../pickers/SprintPicker';
import { StatusPicker } from '../pickers/StatusPicker';
import { TagPicker } from '../pickers/TagPicker';
import { useTaskView } from './TaskContext';

/** One row of the 112px-label grid (36px, 14px icon + label in `--text-muted`). */
function PropertyRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <>
      <span className="flex h-9 items-center gap-2 text-muted">
        {icon}
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div>
    </>
  );
}

/** Borderless 32px value button with the ghost hover (the design's `.field`). */
function FieldButton({
  props,
  open,
  label,
  className,
  children,
}: {
  props: TriggerProps;
  open: boolean;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={label}
      aria-haspopup="dialog"
      className={cn(
        'inline-flex h-8 max-w-full min-w-0 items-center gap-2 rounded-[8px] border-0 px-2.5 text-[13px] font-medium text-default hover:bg-hover',
        open ? 'bg-hover' : 'bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  );
}

const toStatusRef = ({ id, name, category, color }: Status) => ({ id, name, category, color });

interface TaskPropertiesProps {
  moveOpen: boolean;
  onMoveOpenChange: (open: boolean) => void;
}

/**
 * Properties grid (TaskDetail.dc.html): Status (outlined, listbox), Assignees (pill chips +
 * dashed add), Due date ("Today, Oct 8 · Started Oct 4"), Priority, Tags, Sprint, Project
 * (moves the task). Every change is optimistic in the drawer and the view behind it.
 */
export function TaskProperties({ moveOpen, onMoveOpenChange }: TaskPropertiesProps) {
  const { t } = useTranslation();
  const view = useTaskView();
  const { task, project, members, teamIds, tags, sprints, layout } = view;
  const dates = useDates();
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const sidebar = useSidebar(project?.workspaceId);
  const update = useUpdateTask();
  const setAssignees = useSetAssignees();
  const setTags = useSetTags();
  const move = useMoveTaskToProject();
  const done = task.status.category === 'done';
  const statusName = (s: { name: string | null; category: StatusCategory }) =>
    s.name ?? t(`status.${s.category}`);
  const sprint = sprints.find((s) => s.id === task.sprintId) ?? task.sprint;

  function dueLabel(date: string) {
    const rel = relativeDay(date, dates.today);
    const formatted = dates.formatDate(date);
    return rel
      ? t('drawer.dueRelative', { relative: t(`dates.${rel}`), date: formatted })
      : formatted;
  }

  function setAssigneeList(users: UserRef[]) {
    setAssignees.mutate({ task, users });
  }

  function moveTo(target: { id: string; name: string }) {
    move.mutate(
      { task, projectId: target.id },
      {
        onSuccess: (moved) => {
          toast({ message: t('drawer.movedTo', { project: target.name, key: moved.key }) });
          if (layout === 'page') {
            void navigate(`/t/${moved.key}`, { replace: true });
          } else {
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('task', moved.key);
                return next;
              },
              { replace: true },
            );
          }
        },
        onError: () => {
          toast({ message: t('common.genericError'), tone: 'danger' });
        },
      },
    );
  }

  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-y-1 text-[13px]">
      <PropertyRow icon={<StatusIcon size={14} />} label={t('drawer.status')}>
        <StatusPicker
          label={t('drawer.status')}
          value={task.status.id}
          statuses={project?.statuses ?? [task.status]}
          onChange={(s) => {
            if (s.id === task.status.id) return;
            const full = project?.statuses.find((x) => x.id === s.id);
            update.mutate({
              task,
              patch: { statusId: s.id },
              status: full ? toStatusRef(full) : task.status,
            });
          }}
          trigger={(props, open) => (
            <button
              type="button"
              {...props}
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={`${t('drawer.status')}: ${statusName(task.status)}`}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-[8px] border border-default px-2.5 text-[13px] font-medium text-default hover:bg-hover',
                open ? 'bg-hover' : 'bg-control',
              )}
            >
              <StatusDot category={task.status.category} />
              {statusName(task.status)}
              <ChevronDownIcon size={12} className="text-icon" />
            </button>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<PersonIcon size={14} />} label={t('drawer.assignees')}>
        {task.assignees.map((user) => (
          <span
            key={user.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-default pr-2.5 pl-[3px] text-[13px]"
          >
            <Avatar user={user} size={22} title={null} />
            {shortName(user.name)}
          </span>
        ))}
        <AssigneePicker
          label={t('drawer.addAssignee')}
          value={task.assignees}
          members={members}
          teamIds={teamIds}
          onChange={setAssigneeList}
          trigger={(props, open) => (
            <button
              type="button"
              {...props}
              aria-label={t('drawer.addAssignee')}
              title={t('drawer.addAssignee')}
              className={cn(
                'flex size-7 items-center justify-center rounded-full border border-dashed border-strong text-icon hover:bg-hover',
                open ? 'bg-hover' : 'bg-transparent',
              )}
            >
              <PlusIcon size={12} strokeWidth={2.5} />
            </button>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<CalendarIcon size={14} />} label={t('table.colDue')}>
        <DuePicker
          label={t('table.colDue')}
          value={task.dueDate}
          onChange={(dueDate) => {
            if (dueDate !== task.dueDate) update.mutate({ task, patch: { dueDate } });
          }}
          trigger={(props, open) => (
            <FieldButton
              props={props}
              open={open}
              label={t('table.colDue')}
              className={cn(
                task.dueDate ? DUE_TONE_CLASS[dates.dueTone(task.dueDate, done)] : 'text-faint',
              )}
            >
              {task.dueDate ? dueLabel(task.dueDate) : t('picker.noDue')}
            </FieldButton>
          )}
        />
        <DuePicker
          label={t('drawer.startDate')}
          value={task.startDate}
          onChange={(startDate) => {
            if (startDate !== task.startDate) update.mutate({ task, patch: { startDate } });
          }}
          trigger={(props, open) => (
            <button
              type="button"
              {...props}
              aria-label={t('drawer.startDate')}
              className={cn(
                'group/start -ml-2.5 inline-flex h-8 items-center rounded-[8px] border-0 px-2 text-[13px] text-muted hover:bg-hover',
                open ? 'bg-hover' : 'bg-transparent',
              )}
            >
              {task.startDate ? (
                `· ${t(task.startDate > dates.today ? 'drawer.starts' : 'drawer.started', {
                  date: dates.formatDate(task.startDate),
                })}`
              ) : (
                <span className="text-faint opacity-0 group-hover/start:opacity-100 group-focus-visible/start:opacity-100">
                  + {t('drawer.startDate')}
                </span>
              )}
            </button>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<FlagIcon size={14} />} label={t('table.colPriority')}>
        <PriorityPicker
          label={t('table.colPriority')}
          value={task.priority}
          onChange={(priority) => {
            if (priority !== task.priority) update.mutate({ task, patch: { priority } });
          }}
          trigger={(props, open) => (
            <FieldButton props={props} open={open} label={t('table.colPriority')}>
              <PriorityFlag priority={task.priority} showLabel />
            </FieldButton>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<TagIcon size={14} />} label={t('table.colTags')}>
        <div className="flex flex-wrap items-center gap-1 pl-2.5">
          {task.tags.map((tag) => (
            <TagChip key={tag.id} name={tag.name} color={tag.color} />
          ))}
          <TagPicker
            label={t('drawer.addTag')}
            value={task.tags}
            tags={tags}
            onChange={(next) => {
              setTags.mutate({ task, tags: next });
            }}
            trigger={(props, open) => (
              <button
                type="button"
                {...props}
                aria-label={t('drawer.addTag')}
                title={t('drawer.addTag')}
                className={cn(
                  'flex size-6 items-center justify-center rounded-[6px] border-0 text-icon hover:bg-hover',
                  open ? 'bg-hover' : 'bg-transparent',
                )}
              >
                <PlusIcon size={12} strokeWidth={2.5} />
              </button>
            )}
          />
        </div>
      </PropertyRow>

      <PropertyRow icon={<SprintIcon size={14} />} label={t('drawer.sprint')}>
        <SprintPicker
          label={t('drawer.sprint')}
          value={task.sprintId}
          sprints={sprints}
          onChange={(sprintId) => {
            if (sprintId !== task.sprintId) update.mutate({ task, patch: { sprintId } });
          }}
          trigger={(props, open) => (
            <FieldButton
              props={props}
              open={open}
              label={t('drawer.sprint')}
              className={cn(!sprint && 'font-normal text-faint')}
            >
              {sprint ? (
                <span
                  className="truncate"
                  title={dates.formatRange(sprint.startDate, sprint.endDate)}
                >
                  {sprint.name}
                </span>
              ) : (
                t('drawer.noSprint')
              )}
            </FieldButton>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<FolderIcon size={14} />} label={t('drawer.project')}>
        <ProjectPicker
          label={t('create.moveToProject')}
          spaces={sidebar.data?.spaces ?? []}
          value={task.project.id}
          open={moveOpen}
          onOpenChange={onMoveOpenChange}
          onChange={moveTo}
          trigger={(props, open) => (
            <FieldButton props={props} open={open} label={t('drawer.project')}>
              <ProjectDot color={task.project.color} size={8} />
              <span className="truncate">{task.project.name}</span>
            </FieldButton>
          )}
        />
      </PropertyRow>
    </div>
  );
}
