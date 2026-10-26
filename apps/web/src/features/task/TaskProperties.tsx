import {
  isAway,
  isClosedCategory,
  shortName,
  type Status,
  type StatusCategory,
  type UserRef,
} from '@kite/shared';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { useFollowTask } from '../../api/activity';
import { useSidebar, useWsPath } from '../../api/workspaces';
import type { EditedField } from '@kite/shared/client';
import { useRecentEdit } from '../../stores/realtime';
import { useAuth } from '../../auth/useAuth';
import { useMoveTaskToProject, useSetAssignees, useSetTags, useUpdateTask } from '../../api/tasks';
import {
  BanIcon,
  BellIcon,
  CalendarIcon,
  ChevronDownIcon,
  CloseIcon,
  FlagIcon,
  FolderIcon,
  PersonIcon,
  PlusIcon,
  ReviewerIcon,
  SizeIcon,
  SprintIcon,
  StatusIcon,
  TagIcon,
} from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { IconButton } from '../../components/ui/IconButton';
import type { TriggerProps } from '../../components/ui/Popover';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { StatusDot } from '../../components/ui/StatusDot';
import { TagChip } from '../../components/ui/TagChip';
import { cn } from '../../lib/cn';
import { DUE_TONE_CLASS, relativeDay } from '../../lib/dates';
import { useDates } from '../../lib/useDates';
import { useShortNames } from '../../lib/useShortNames';
import { toast } from '../../stores/toast';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { DuePicker } from '../pickers/DuePicker';
import { PriorityPicker } from '../pickers/PriorityPicker';
import { ProjectPicker } from '../pickers/ProjectPicker';
import { SprintPicker } from '../pickers/SprintPicker';
import { StatusPicker } from '../pickers/StatusPicker';
import { TagPicker } from '../pickers/TagPicker';
import { sprintLabel } from '../../lib/sprint';
import { SizeControl } from './SizeProperty';
import { useTaskView } from './TaskContext';
import { BlockedValue } from '../standup/BlockedMarker';

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
 * dashed add), Reviewer (while in review), Due date ("Today, Oct 8 · Started Oct 4"),
 * Priority, Size, Tags, Sprint, Project (moves the task). Every change is optimistic in the drawer and the view behind it.
 */
export function TaskProperties({ moveOpen, onMoveOpenChange }: TaskPropertiesProps) {
  const ws = useWsPath();
  const { t } = useTranslation();
  const view = useTaskView();
  const { task, project, members, teamIds, tags, sprints, layout } = view;
  const memberUsers = useMemo(() => members.map((m) => m.user), [members]);
  const shortNameOf = useShortNames(memberUsers);
  const dates = useDates();
  const awayIds = new Set(members.filter((m) => isAway(m, dates.today)).map((m) => m.user.id));
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const sidebar = useSidebar(project?.workspaceId);
  const update = useUpdateTask();
  const setAssignees = useSetAssignees();
  const setTags = useSetTags();
  const move = useMoveTaskToProject();
  const closed = isClosedCategory(task.status.category);
  const statusName = (s: { name: string | null; category: StatusCategory }) =>
    s.name ?? t(`status.${s.category}`);
  const sprint = sprints.find((s) => s.id === task.sprintId) ?? task.sprint;
  const inReview = task.status.category === 'review';
  const reviewer =
    members.find((m) => m.user.id === task.reviewerId)?.user ??
    (task.reviewer?.id === task.reviewerId ? task.reviewer : null);

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
            void navigate(ws(`/t/${moved.key}`), { replace: true });
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
        <EditedBy field="status" />
      </PropertyRow>

      {task.blocked && !closed && (
        <PropertyRow icon={<BanIcon size={14} />} label={t('task.blocked.label')}>
          <BlockedValue blocked={task.blocked} />
        </PropertyRow>
      )}
      <PropertyRow icon={<PersonIcon size={14} />} label={t('drawer.assignees')}>
        {task.assignees.map((user) => (
          <span
            key={user.id}
            className="inline-flex h-7 items-center gap-1.5 rounded-full border border-default pr-[3px] pl-[3px] text-[13px]"
          >
            <Avatar user={user} size={22} title={null} />
            {shortNameOf(user)}
            {awayIds.has(user.id) && (
              <span className="text-[11px] text-muted">{t('picker.away')}</span>
            )}
            <IconButton
              label={t('drawer.removeAssignee', { name: user.name })}
              size={20}
              radius={10}
              onClick={() => {
                setAssigneeList(task.assignees.filter((u) => u.id !== user.id));
              }}
              icon={<CloseIcon size={12} className="text-icon" />}
            />
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
        <EditedBy field="assignees" />
      </PropertyRow>

      {inReview && (
        <PropertyRow icon={<ReviewerIcon size={14} />} label={t('drawer.reviewer')}>
          <AssigneePicker
            single
            label={t('drawer.reviewer')}
            noneLabel={t('drawer.noReviewer')}
            value={reviewer ? [reviewer] : []}
            members={members}
            teamIds={teamIds}
            onChange={([next]) => {
              const reviewerId = next?.id ?? null;
              if (reviewerId !== task.reviewerId) {
                update.mutate({ task, patch: { reviewerId }, reviewer: next ?? null });
              }
            }}
            trigger={(props, open) => (
              <FieldButton
                props={props}
                open={open}
                label={t('drawer.reviewer')}
                className={cn(!reviewer && 'font-normal text-faint')}
              >
                {reviewer ? (
                  <>
                    <Avatar user={reviewer} size={20} title={null} />
                    <span className="truncate">{shortNameOf(reviewer)}</span>
                  </>
                ) : (
                  t('drawer.noReviewer')
                )}
              </FieldButton>
            )}
          />
        </PropertyRow>
      )}

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
                task.dueDate ? DUE_TONE_CLASS[dates.dueTone(task.dueDate, closed)] : 'text-faint',
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
        <EditedBy field="due" />
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
        <EditedBy field="priority" />
      </PropertyRow>

      <PropertyRow icon={<SizeIcon size={14} />} label={t('taskSize.label')}>
        <SizeControl
          className="flex flex-wrap items-center gap-2.5 pl-2.5"
          value={task.size}
          onChange={(size) => {
            if (size !== task.size) update.mutate({ task, patch: { size } });
          }}
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
          project={project}
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
                  {sprintLabel(t, sprint)}
                </span>
              ) : (
                t('drawer.noSprint')
              )}
            </FieldButton>
          )}
        />
      </PropertyRow>

      <PropertyRow icon={<BellIcon size={14} />} label={t('drawer.followers')}>
        <FollowersField />
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

/**
 * Who gets comment and status notifications (creator, assignees and commenters follow
 * automatically), and the viewer's Follow / Following toggle (not designed).
 */
function FollowersField() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { task } = useTaskView();
  const follow = useFollowTask();
  const following = task.followers.some((u) => u.id === me?.user.id);
  return (
    <>
      {task.followers.length > 0 && (
        <AvatarStack
          users={task.followers}
          size={24}
          ring="surface"
          max={5}
          label={t('drawer.followersLabel', {
            count: task.followers.length,
            names: task.followers.map((u) => u.name).join(', '),
          })}
        />
      )}
      <button
        type="button"
        aria-pressed={following}
        disabled={follow.isPending}
        onClick={() => {
          follow.mutate({ taskId: task.id, follow: !following });
        }}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-[8px] border border-control bg-control px-2.5 text-[12px] font-medium hover:bg-hover',
          following ? 'text-2' : 'text-accent-ink',
        )}
      >
        <BellIcon size={12} />
        {following ? t('drawer.following') : t('drawer.follow')}
      </button>
    </>
  );
}

/** "Dorj E. just now" after a field someone else changed in the last 10 s (not designed). */
function EditedBy({ field }: { field: EditedField }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const { task, members } = useTaskView();
  const actorId = useRecentEdit(task.id, field, me?.user.id);
  if (!actorId) return null;
  const name = members.find((m) => m.user.id === actorId)?.user.name ?? t('drawer.someone');
  return (
    <span role="status" className="text-[11px] whitespace-nowrap text-muted">
      {t('drawer.editedBy', { name: shortName(name) })}
    </span>
  );
}
