import type {
  BatchTaskUpdate,
  ProjectDetail,
  TaskListItem,
  UserRef,
  WorkspaceMember,
} from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBatchDelete, useBatchRestore, useBatchUpdate } from '../../api/batch';
import { useSprints } from '../../api/projects';
import {
  CalendarIcon,
  CloseIcon,
  FlagIcon,
  PersonIcon,
  SprintIcon,
  StatusIcon,
  TrashIcon,
} from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { toast } from '../../stores/toast';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { DuePicker } from '../pickers/DuePicker';
import { PriorityPicker } from '../pickers/PriorityPicker';
import { SprintPicker } from '../pickers/SprintPicker';
import { StatusPicker } from '../pickers/StatusPicker';
import { statusRef } from './useCreateInStatus';

type AssignMode = 'add' | 'replace' | 'remove';

/** The fields a batch can change, with their list-row values (for the optimistic rows / Undo). */
type Change = Omit<BatchTaskUpdate, 'id'>;

const toRef = ({ id, name, initials, avatarColor }: UserRef): UserRef => ({
  id,
  name,
  initials,
  avatarColor,
});

/** The row fields a change touches, as they are now (what Undo puts back). */
function previousOf(
  task: TaskListItem,
  change: Change,
): { update: Change; row: Partial<TaskListItem> } {
  const update: Change = {};
  const row: Partial<TaskListItem> = {};
  if (change.statusId !== undefined) {
    update.statusId = task.status.id;
    row.status = task.status;
  }
  if (change.sprintId !== undefined) update.sprintId = row.sprintId = task.sprintId;
  if (change.assigneeIds !== undefined) {
    update.assigneeIds = task.assignees.map((u) => u.id);
    row.assignees = task.assignees;
  }
  if (change.dueDate !== undefined) update.dueDate = row.dueDate = task.dueDate;
  if (change.priority !== undefined) update.priority = row.priority = task.priority;
  return { update, row };
}

interface BulkBarProps {
  project: ProjectDetail;
  /** The selected rows, in list order. */
  tasks: readonly TaskListItem[];
  members: readonly WorkspaceMember[];
  teamIds: ReadonlySet<string>;
  onClear: () => void;
}

/**
 * List multi-select actions (not designed): a floating bar at the bottom — "N selected",
 * Status / Sprint / Assignee (add, replace, remove) / Due / Priority / Delete, ×. Each action
 * is one batch request with one toast whose Undo puts every task back.
 */
export function BulkBar({ project, tasks, members, teamIds, onClear }: BulkBarProps) {
  const { t } = useTranslation();
  const sprints = useSprints(project.id);
  const update = useBatchUpdate(project.id);
  const remove = useBatchDelete(project.id);
  const restore = useBatchRestore(project.id);
  const [assignMode, setAssignMode] = useState<AssignMode | null>(null);
  const count = tasks.length;

  /** Sends `next` per task (skipping tasks it wouldn't change) with Undo. */
  function apply(
    next: (task: TaskListItem) => { change: Change; row: Partial<TaskListItem> } | null,
    message: string,
  ) {
    const updates: BatchTaskUpdate[] = [];
    const optimistic = new Map<string, Partial<TaskListItem>>();
    const undo: BatchTaskUpdate[] = [];
    const undoRows = new Map<string, Partial<TaskListItem>>();
    for (const task of tasks) {
      const result = next(task);
      if (!result) continue;
      updates.push({ id: task.id, ...result.change });
      optimistic.set(task.id, result.row);
      const previous = previousOf(task, result.change);
      undo.push({ id: task.id, ...previous.update });
      undoRows.set(task.id, previous.row);
    }
    if (updates.length === 0) return;
    update.mutate(
      { updates, optimistic },
      {
        onSuccess: () => {
          toast({
            message,
            action: {
              label: t('common.undo'),
              onClick: () => {
                update.mutate({ updates: undo, optimistic: undoRows });
              },
            },
          });
        },
      },
    );
  }

  function assign(user: UserRef | undefined, mode: AssignMode) {
    if (!user) return;
    const ref = toRef(user);
    apply(
      (task) => {
        const has = task.assignees.some((u) => u.id === user.id);
        let next: UserRef[];
        if (mode === 'add') {
          if (has) return null;
          next = [...task.assignees, ref];
        } else if (mode === 'remove') {
          if (!has) return null;
          next = task.assignees.filter((u) => u.id !== user.id);
        } else {
          if (has && task.assignees.length === 1) return null;
          next = [ref];
        }
        return { change: { assigneeIds: next.map((u) => u.id) }, row: { assignees: next } };
      },
      t(`bulk.assigned.${mode}`, { count, name: user.name }),
    );
  }

  // Remove offers only people assigned to one of the selected tasks.
  const assignedIds = new Set(tasks.flatMap((task) => task.assignees.map((u) => u.id)));
  const pickable =
    assignMode === 'remove' ? members.filter((m) => assignedIds.has(m.user.id)) : members;

  return (
    <div
      role="toolbar"
      aria-label={t('bulk.label', { count })}
      className="fixed bottom-20 left-1/2 z-[60] flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-1.5 rounded-[12px] border border-default bg-surface p-1.5 pl-3.5 shadow-popover"
    >
      <span className="mr-1 text-[13px] font-medium whitespace-nowrap" aria-live="polite">
        {t('bulk.selected', { count })}
      </span>
      <StatusPicker
        value=""
        statuses={project.statuses}
        label={t('bulk.setStatus')}
        onChange={(status) => {
          const full = project.statuses.find((s) => s.id === status.id);
          if (!full) return;
          apply(
            (task) =>
              task.status.id === full.id
                ? null
                : { change: { statusId: full.id }, row: { status: statusRef(full) } },
            t('bulk.moved', { count, status: full.name ?? t(`status.${full.category}`) }),
          );
        }}
        trigger={(props) => (
          <ToolbarButton {...props} icon={<StatusIcon size={14} />}>
            {t('drawer.status')}
          </ToolbarButton>
        )}
      />
      {(sprints.data?.length ?? 0) > 0 && (
        <SprintPicker
          value={null}
          sprints={sprints.data ?? []}
          label={t('bulk.setSprint')}
          onChange={(sprintId) => {
            const sprint = sprints.data?.find((s) => s.id === sprintId);
            apply(
              (task) =>
                task.sprintId === sprintId ? null : { change: { sprintId }, row: { sprintId } },
              sprint
                ? t('bulk.sprint', {
                    count,
                    sprint: sprint.name ?? t('sprint.name', { number: sprint.number }),
                  })
                : t('bulk.noSprint', { count }),
            );
          }}
          trigger={(props) => (
            <ToolbarButton {...props} icon={<SprintIcon size={14} />}>
              {t('drawer.sprint')}
            </ToolbarButton>
          )}
        />
      )}
      <span className="relative flex">
        <Menu
          label={t('bulk.assignees')}
          items={(['add', 'replace', 'remove'] as const).map((mode) => ({
            id: mode,
            label: t(`bulk.assign.${mode}`),
            disabled: mode === 'remove' && assignedIds.size === 0,
            onSelect: () => {
              // After the menu has closed and returned focus to its button.
              requestAnimationFrame(() => {
                setAssignMode(mode);
              });
            },
          }))}
          trigger={(props) => (
            <ToolbarButton {...props} icon={<PersonIcon size={14} />}>
              {t('drawer.assignees')}
            </ToolbarButton>
          )}
        />
        <AssigneePicker
          single
          value={[]}
          members={pickable}
          teamIds={teamIds}
          label={assignMode ? t(`bulk.assign.${assignMode}`) : t('bulk.assignees')}
          open={assignMode !== null}
          onOpenChange={(open) => {
            if (!open) setAssignMode(null);
          }}
          onChange={([user]) => {
            if (assignMode) assign(user, assignMode);
            setAssignMode(null);
          }}
          trigger={(props) => (
            <span ref={props.ref} aria-hidden="true" className="absolute inset-0 -z-10" />
          )}
        />
      </span>
      <DuePicker
        value={null}
        label={t('bulk.setDue')}
        onChange={(dueDate) => {
          apply(
            (task) => (task.dueDate === dueDate ? null : { change: { dueDate }, row: { dueDate } }),
            dueDate ? t('bulk.due', { count }) : t('bulk.noDue', { count }),
          );
        }}
        trigger={(props) => (
          <ToolbarButton {...props} icon={<CalendarIcon size={14} />}>
            {t('table.colDue')}
          </ToolbarButton>
        )}
      />
      <PriorityPicker
        value={'none'}
        label={t('bulk.setPriority')}
        onChange={(priority) => {
          apply(
            (task) =>
              task.priority === priority ? null : { change: { priority }, row: { priority } },
            t('bulk.priority', { count, priority: t(`priority.${priority}`) }),
          );
        }}
        trigger={(props) => (
          <ToolbarButton {...props} icon={<FlagIcon size={14} />}>
            {t('table.colPriority')}
          </ToolbarButton>
        )}
      />
      <ToolbarButton
        icon={<TrashIcon size={14} />}
        className="text-danger"
        onClick={() => {
          const ids = tasks.map((task) => task.id);
          onClear();
          remove.mutate(ids, {
            onSuccess: () => {
              toast({
                message: t('bulk.deleted', { count: ids.length }),
                action: {
                  label: t('common.undo'),
                  onClick: () => {
                    restore.mutate(ids);
                  },
                },
              });
            },
          });
        }}
      >
        {t('table.delete')}
      </ToolbarButton>
      <IconButton
        label={t('bulk.clear')}
        title={t('bulk.clear')}
        size={32}
        onClick={onClear}
        icon={<CloseIcon size={14} />}
      />
    </div>
  );
}
