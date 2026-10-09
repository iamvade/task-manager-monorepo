import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, type SortingStrategy } from '@dnd-kit/sortable';
import type { StatusCategory, TaskListItem } from '@kite/shared';
import {
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { isTempTask } from '../../api/tasks';
import { MoreIcon, PlusIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { StatusDot } from '../../components/ui/StatusDot';
import { cn } from '../../lib/cn';
import type { DropTarget } from './boardDrag';
import { DropPlaceholder } from './DropPlaceholder';
import { TaskCard } from './TaskCard';

export const COLUMN_PREFIX = 'column:';

/** Cards never shift while dragging: the placeholder shows where the card lands. */
const noShift: SortingStrategy = () => null;

const TINT: Record<StatusCategory, string> = {
  todo: 'bg-tint-todo-header text-tint-todo',
  in_progress: 'bg-tint-progress text-tint-progress',
  review: 'bg-tint-review text-tint-review',
  done: 'bg-tint-done text-tint-done',
};

type Listener<E> = ((event: E) => void) | undefined;

function SortableCard({
  task,
  href,
  disabled,
  showProject,
}: {
  task: TaskListItem;
  href: string | undefined;
  disabled: boolean;
  showProject: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({ id: task.id, disabled });
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLElement>>;
  return (
    <TaskCard
      ref={setNodeRef}
      task={task}
      href={isTempTask(task) ? undefined : href}
      state={isDragging ? 'ghost' : 'idle'}
      showProject={showProject}
      aria-roledescription={disabled ? undefined : attributes['aria-roledescription']}
      aria-describedby={disabled ? undefined : attributes['aria-describedby']}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        // Space on the focused card picks it up; Enter follows the link (opens the drawer).
        if (e.target === e.currentTarget) onKeyDown?.(e);
      }}
    />
  );
}

/** Inline add at the bottom of a column: a card-styled input; Enter adds and keeps it open. */
function AddCard({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  return (
    <input
      type="text"
      autoFocus
      value={title}
      maxLength={500}
      aria-label={t('table.newTaskTitle')}
      placeholder={t('board.addTaskPlaceholder')}
      onChange={(e) => {
        setTitle(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const value = title.trim();
          if (!value) return;
          onSubmit(value);
          setTitle('');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setTitle('');
          onCancel();
        }
      }}
      onBlur={() => {
        if (!title.trim()) onCancel();
      }}
      className="box-border h-11 w-full flex-none rounded-[10px] border border-accent bg-surface px-3 text-[14px] text-default shadow-ring-soft outline-none placeholder:text-faint focus-visible:outline-none"
    />
  );
}

export interface BoardColumnProps {
  columnKey: string;
  label: string;
  category: StatusCategory;
  tasks: readonly TaskListItem[];
  /** Pointer or keyboard drag running and this column is the target. */
  isTarget: boolean;
  target: DropTarget | null;
  /** Show the drop placeholder (hidden when the drop would be a no-op). */
  showPlaceholder: boolean;
  dnd: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Null: no inline add (space board). */
  onAdd: ((title: string) => void) | null;
  adding: boolean;
  onStartAdd: () => void;
  onCancelAdd: () => void;
  taskHref: (task: TaskListItem) => string;
  showProject: boolean;
}

/**
 * Board column (Board.dc.html): #F7F7F8 panel, radius 12, padding 8, gap 8; 36px header
 * tinted by category (dot, label, white count, +, …); cards scroll on their own; "+ Add task"
 * at the bottom. The target column of a drag gets an accent border; collapsed = a 44px strip.
 */
export function BoardColumn({
  columnKey,
  label,
  category,
  tasks,
  isTarget,
  target,
  showPlaceholder,
  dnd,
  collapsed,
  onToggleCollapsed,
  onAdd,
  adding,
  onStartAdd,
  onCancelAdd,
  taskHref,
  showProject,
}: BoardColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${columnKey}`, disabled: !dnd });
  const sectionLabel = t('board.columnLabel', { status: label, count: tasks.length });
  const menuItems: MenuItem[] = [
    ...(onAdd
      ? [
          {
            id: 'add',
            label: t('board.addTaskTo', { status: label }),
            icon: <PlusIcon size={14} />,
            onSelect: onStartAdd,
          },
        ]
      : []),
    {
      id: 'collapse',
      label: collapsed
        ? t('board.expandColumn', { status: label })
        : t('board.collapseColumn', { status: label }),
      onSelect: onToggleCollapsed,
    },
  ];
  const targetBorder = isTarget && 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)]';

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={sectionLabel}
        className={cn(
          'box-border flex w-11 flex-none flex-col items-center gap-2 self-stretch rounded-[12px] border border-subtle bg-sidebar py-2',
          targetBorder,
        )}
      >
        <button
          type="button"
          aria-expanded={false}
          aria-label={t('board.expandColumn', { status: label })}
          onClick={onToggleCollapsed}
          className={cn(
            'flex w-9 flex-col items-center gap-2 rounded-[8px] border-0 py-2.5',
            TINT[category],
          )}
        >
          <StatusDot category={category} />
          <span className="flex min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[12px] leading-5 font-semibold">
            {tasks.length}
          </span>
          <span className="text-[13px] font-semibold [writing-mode:vertical-rl]">{label}</span>
        </button>
      </section>
    );
  }

  const placeholderAt = isTarget && showPlaceholder && target ? (target.nextId ?? 'end') : null;

  return (
    <section
      ref={setNodeRef}
      aria-label={sectionLabel}
      className={cn(
        'box-border flex max-h-full min-w-0 flex-[1_0_264px] flex-col gap-2 rounded-[12px] border border-subtle bg-sidebar p-2',
        targetBorder,
      )}
    >
      <div
        className={cn(
          'flex h-9 flex-none items-center gap-2 rounded-[8px] pr-1.5 pl-2.5',
          TINT[category],
        )}
      >
        <StatusDot category={category} />
        <h2 className="m-0 truncate text-[13px] font-semibold">{label}</h2>
        <span className="box-border flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[12px] font-semibold">
          {tasks.length}
        </span>
        <span className="flex-1" />
        {onAdd && (
          <IconButton
            label={t('board.addTaskTo', { status: label })}
            title={t('board.addTaskTo', { status: label })}
            icon={<PlusIcon size={14} />}
            onClick={onStartAdd}
            className="text-3"
          />
        )}
        <Menu
          label={t('board.columnOptions', { status: label })}
          placement="bottom-end"
          width={220}
          items={menuItems}
          trigger={(props, open) => (
            <IconButton
              {...props}
              label={t('board.columnOptions', { status: label })}
              title={t('board.columnOptions', { status: label })}
              icon={<MoreIcon size={14} />}
              className={cn('text-3', open && 'bg-hover')}
            />
          )}
        />
      </div>

      <div className="-mx-1 flex min-h-0 flex-col gap-2 overflow-y-auto px-1 pb-0.5">
        <SortableContext items={tasks.map((task) => task.id)} strategy={noShift} disabled={!dnd}>
          {tasks.map((task) => (
            <div key={task.id} className="flex flex-col gap-2">
              {placeholderAt === task.id && <DropPlaceholder status={label} />}
              <SortableCard
                task={task}
                href={taskHref(task)}
                disabled={!dnd || isTempTask(task)}
                showProject={showProject}
              />
            </div>
          ))}
        </SortableContext>
        {placeholderAt === 'end' && <DropPlaceholder status={label} />}
        {adding && onAdd && <AddCard onSubmit={onAdd} onCancel={onCancelAdd} />}
      </div>

      {onAdd && !adding && (
        <button
          type="button"
          onClick={onStartAdd}
          className="flex h-9 flex-none items-center gap-2 rounded-[8px] border-0 bg-transparent px-2.5 text-left text-[13px] text-muted hover:bg-hover"
        >
          <PlusIcon size={14} />
          {t('table.addTask')}
        </button>
      )}
    </section>
  );
}
