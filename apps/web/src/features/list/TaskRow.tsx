import { shortName, type TaskListItem } from '@kite/shared';
import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { isTempTask } from '../../api/tasks';
import {
  CalendarIcon,
  CommentIcon,
  MoreIcon,
  PlusIcon,
  SubtaskIcon,
  UserPlusIcon,
} from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { Checkbox } from '../../components/ui/Checkbox';
import { DueDate } from '../../components/ui/DueDate';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import type { TriggerProps } from '../../components/ui/Popover';
import { PriorityFlag } from '../../components/ui/PriorityFlag';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { TagChip } from '../../components/ui/TagChip';
import { cn } from '../../lib/cn';
import { AssigneePicker } from '../pickers/AssigneePicker';
import { DuePicker } from '../pickers/DuePicker';
import { PriorityPicker } from '../pickers/PriorityPicker';
import { TagPicker } from '../pickers/TagPicker';
import { GRID_COLUMNS, isDone, useListActions } from './ListContext';

interface TaskRowProps {
  task: TaskListItem;
  /** 44 comfortable / 36 compact. */
  height: number;
  selected?: boolean;
  /** Roving tab stop: the selected row (or the first one) is tabbable. */
  tabbable?: boolean;
  /** Space list: the task's project before the title. */
  showProject?: boolean;
  /** source = the row left behind while dragging; overlay = the copy under the pointer. */
  dragState?: 'source' | 'overlay';
  rowRef?: Ref<HTMLDivElement>;
  /** dnd-kit attributes/listeners + transform style. */
  rowProps?: HTMLAttributes<HTMLDivElement>;
}

/** Clicks inside portalled popovers bubble through React; only real row clicks count. */
const fromRow = (e: MouseEvent<HTMLElement>) =>
  e.currentTarget.contains(e.target as Node) &&
  !(e.target as HTMLElement).closest('button, a, input, [role="dialog"]');

/** Opens a picker from a cell; aligned with the column edge (−6px) like plain text. */
function CellButton({
  label,
  props,
  open,
  children,
}: {
  label: string;
  props: TriggerProps;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      {...props}
      className={cn(
        '-ml-1.5 flex h-7 w-[calc(100%+6px)] min-w-0 items-center gap-2 overflow-hidden rounded-[6px] border-0 bg-transparent px-1.5 text-left hover:bg-hover',
        open && 'bg-hover',
      )}
    >
      {children}
    </button>
  );
}

/** Faint icon in an empty cell, shown on row hover / focus (derived). */
function EmptyHint({ icon }: { icon: ReactNode }) {
  return (
    <span className="flex text-faint opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
      {icon}
    </span>
  );
}

/** One task in the List (Main.dc.html row). */
export function TaskRow({
  task,
  height,
  selected,
  tabbable,
  showProject,
  dragState,
  rowRef,
  rowProps,
}: TaskRowProps) {
  const { t } = useTranslation();
  const actions = useListActions();
  const done = isDone(task);
  const temp = isTempTask(task);
  const [first, ...others] = task.assignees;
  const inert = temp || dragState === 'overlay';

  return (
    <div
      ref={rowRef}
      {...rowProps}
      role="row"
      data-task-row={task.id}
      data-selected={selected ? true : undefined}
      tabIndex={inert ? undefined : tabbable ? 0 : -1}
      onClick={(e) => {
        if (inert || !fromRow(e)) return;
        actions.select(task);
        actions.open(task);
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget && !inert) actions.select(task);
      }}
      className={cn(
        'group/row box-border grid items-center border-b border-subtle px-2 hover:bg-subtle focus-visible:-outline-offset-2',
        selected && 'bg-subtle shadow-[inset_2px_0_0_var(--accent-ink)]',
        dragState === 'source' && 'opacity-40',
        dragState === 'overlay' &&
          'cursor-grabbing rounded-[8px] border-transparent bg-surface shadow-drag',
        temp && 'opacity-60',
      )}
      style={{ ...rowProps?.style, gridTemplateColumns: GRID_COLUMNS, height }}
    >
      <div role="cell" className="flex items-center justify-center">
        <Checkbox
          checked={done}
          disabled={inert}
          onChange={() => {
            actions.toggleComplete(task);
          }}
          label={
            done
              ? t('table.markIncomplete', { name: task.title })
              : t('table.markComplete', { name: task.title })
          }
        />
      </div>

      <div role="cell" className="flex min-w-0 items-center gap-2 pr-4">
        {showProject && (
          <span className="flex max-w-[160px] flex-none items-center gap-1.5 text-[12px] text-muted">
            <ProjectDot color={task.project.color} size={8} />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
        <Link
          to={actions.taskHref(task)}
          tabIndex={inert ? -1 : undefined}
          onClick={(e) => {
            if (inert) e.preventDefault();
            else actions.select(task);
          }}
          className={cn(
            'truncate text-[14px] no-underline',
            done ? 'text-faint line-through' : 'text-default hover:text-default',
          )}
        >
          {task.title}
        </Link>
        {task.subtaskProgress.total > 0 && (
          <span
            className="flex flex-none items-center gap-1 text-[12px] text-muted"
            title={t('table.subtasks', task.subtaskProgress)}
          >
            <SubtaskIcon size={12} />
            <span aria-hidden="true">
              {task.subtaskProgress.done}/{task.subtaskProgress.total}
            </span>
            <span className="sr-only">{t('table.subtasks', task.subtaskProgress)}</span>
          </span>
        )}
        {task.commentCount > 0 && (
          <span className="flex flex-none items-center gap-1 text-[12px] text-muted">
            <CommentIcon size={12} />
            <span aria-hidden="true">{task.commentCount}</span>
            <span className="sr-only">{t('table.comments', { count: task.commentCount })}</span>
          </span>
        )}
      </div>

      <div role="cell" className="flex min-w-0 items-center pr-2">
        {inert ? null : (
          <AssigneePicker
            value={task.assignees}
            members={actions.members}
            teamIds={actions.teamIds}
            label={t('table.setAssignee', { name: task.title })}
            onChange={(users) => {
              actions.setAssignees(task, users);
            }}
            trigger={(props, open) => (
              <CellButton
                label={t('table.setAssignee', { name: task.title })}
                props={props}
                open={open}
              >
                {first ? (
                  <>
                    <span className="flex flex-none items-center">
                      <Avatar user={first} size={24} title={null} ring={others.length > 0} />
                      {others[0] && (
                        <Avatar user={others[0]} size={24} title={null} ring className="-ml-1.5" />
                      )}
                    </span>
                    <span className="truncate text-[13px] text-2">
                      {others.length
                        ? t('table.assigneeMore', {
                            name: shortName(first.name),
                            count: others.length,
                          })
                        : shortName(first.name)}
                    </span>
                  </>
                ) : (
                  <EmptyHint icon={<UserPlusIcon size={14} />} />
                )}
              </CellButton>
            )}
          />
        )}
      </div>

      <div role="cell" className="flex min-w-0 items-center pr-2">
        {inert ? (
          task.dueDate && <DueDate date={task.dueDate} done={done} />
        ) : (
          <DuePicker
            value={task.dueDate}
            label={t('table.setDue', { name: task.title })}
            onChange={(date) => {
              actions.setDue(task, date);
            }}
            trigger={(props, open) => (
              <CellButton label={t('table.setDue', { name: task.title })} props={props} open={open}>
                {task.dueDate ? (
                  <DueDate date={task.dueDate} done={done} />
                ) : (
                  <EmptyHint icon={<CalendarIcon size={14} />} />
                )}
              </CellButton>
            )}
          />
        )}
      </div>

      <div role="cell" className="flex min-w-0 items-center pr-2">
        {inert ? (
          <PriorityFlag priority={task.priority} showLabel />
        ) : (
          <PriorityPicker
            value={task.priority}
            label={t('table.setPriority', { name: task.title })}
            onChange={(priority) => {
              actions.setPriority(task, priority);
            }}
            trigger={(props, open) => (
              <CellButton
                label={t('table.setPriority', { name: task.title })}
                props={props}
                open={open}
              >
                <PriorityFlag priority={task.priority} showLabel />
              </CellButton>
            )}
          />
        )}
      </div>

      <div role="cell" className="flex min-w-0 items-center overflow-hidden">
        {inert ? (
          <span className="flex gap-1 overflow-hidden">
            {task.tags.map((tag) => (
              <TagChip key={tag.id} name={tag.name} color={tag.color} />
            ))}
          </span>
        ) : (
          <TagPicker
            value={task.tags}
            tags={actions.tags}
            label={t('table.setTags', { name: task.title })}
            onChange={(tags) => {
              actions.setTags(task, tags);
            }}
            trigger={(props, open) => (
              <CellButton
                label={t('table.setTags', { name: task.title })}
                props={props}
                open={open}
              >
                {task.tags.length ? (
                  // All chips; the cell clips the overflow ("+N" is Board-only).
                  <span className="flex gap-1 overflow-hidden">
                    {task.tags.map((tag) => (
                      <TagChip key={tag.id} name={tag.name} color={tag.color} />
                    ))}
                  </span>
                ) : (
                  <EmptyHint icon={<PlusIcon size={14} />} />
                )}
              </CellButton>
            )}
          />
        )}
      </div>

      <div role="cell" className="flex items-center justify-center">
        {!inert && (
          <Menu
            label={t('table.moreActions', { name: task.title })}
            placement="bottom-end"
            items={[
              {
                id: 'open',
                label: t('table.open'),
                onSelect: () => {
                  actions.open(task);
                },
              },
              {
                id: 'complete',
                label: done ? t('table.reopen') : t('drawer.markComplete'),
                onSelect: () => {
                  actions.toggleComplete(task);
                },
              },
              {
                id: 'copy',
                label: t('header.copyLink'),
                onSelect: () => {
                  actions.copyLink(task);
                },
              },
              { type: 'separator', id: 'sep' },
              {
                id: 'delete',
                label: t('table.delete'),
                danger: true,
                onSelect: () => {
                  actions.remove(task);
                },
              },
            ]}
            trigger={(props, open) => (
              <IconButton
                {...props}
                label={t('table.moreActions', { name: task.title })}
                size={28}
                icon={<MoreIcon size={14} className="text-icon" />}
                className={cn(
                  'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
                  (open || selected) && 'opacity-100',
                )}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
