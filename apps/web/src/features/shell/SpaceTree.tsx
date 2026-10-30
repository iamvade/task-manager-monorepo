import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { SidebarProject, SidebarSpace } from '@kite/shared';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useRenameProject, useRenameSpace } from '../../api/spaces';
import { useWsPath } from '../../api/workspaces';
import { ChevronRightIcon, MoreIcon, PencilIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import { NewProjectButton } from './NewProjectButton';

const NEW_PROJECT_MS = 7 * 86_400_000;

/** dnd-kit ids: spaces and projects share one drag context in the sidebar. */
export const SPACE_PREFIX = 'space:';
export const PROJECT_PREFIX = 'project:';

type Listener<E> = ((event: E) => void) | undefined;

/**
 * Sortable props for a row's link (admins): pointer drag after 4px, Space picks it up from the
 * keyboard, Enter still follows the link. dnd-kit's role="button" is left out: it stays a link.
 */
function useSortableRow(id: string, disabled: boolean) {
  const sortable = useSortable({ id, disabled });
  const { attributes, listeners } = sortable;
  const onPointerDown = listeners?.onPointerDown as Listener<ReactPointerEvent<HTMLElement>>;
  const onKeyDown = listeners?.onKeyDown as Listener<ReactKeyboardEvent<HTMLElement>>;
  const handle = disabled
    ? {}
    : {
        'aria-roledescription': attributes['aria-roledescription'],
        'aria-describedby': attributes['aria-describedby'],
        onPointerDown,
        onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
          if (e.target === e.currentTarget) onKeyDown?.(e);
        },
      };
  return {
    ...sortable,
    handle,
    style: {
      transform: CSS.Translate.toString(sortable.transform),
      transition: sortable.transition,
    },
  };
}

/** Inline rename field in a sidebar row: Enter or leaving saves, Esc cancels. */
function RenameField({
  name,
  label,
  onSave,
  className,
}: {
  name: string;
  label: string;
  onSave: (name: string) => void;
  className?: string;
}) {
  const setRenaming = useUiStore((s) => s.setRenaming);
  const [value, setValue] = useState(name);
  const ref = useRef<HTMLInputElement>(null);
  // The menu that opened it hands focus back to its trigger on close: focus after that.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => ref.current?.focus());
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);
  const finish = (save: boolean) => {
    const trimmed = value.trim();
    setRenaming(null);
    if (save && trimmed && trimmed !== name) onSave(trimmed);
  };
  return (
    <input
      ref={ref}
      value={value}
      maxLength={80}
      aria-label={label}
      onFocus={(e) => {
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setValue(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => {
        finish(true);
      }}
      className={cn(
        'h-7 min-w-0 flex-1 rounded-[6px] border border-control bg-control px-1.5 text-[13px] text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink',
        className,
      )}
    />
  );
}

/** "⋯" on a row (admins; shown on hover / focus like the "+"): Rename. */
function RowMenu({ label, onRename }: { label: string; onRename: () => void }) {
  const { t } = useTranslation();
  return (
    <Menu
      label={label}
      placement="bottom-end"
      width={180}
      items={[
        {
          id: 'rename',
          label: t('shell.rename'),
          icon: <PencilIcon size={14} />,
          onSelect: onRename,
        },
      ]}
      trigger={(props, open) => (
        <IconButton
          {...props}
          label={label}
          size={24}
          className={cn(
            'flex-none text-muted group-focus-within:opacity-100 group-hover:opacity-100',
            open ? 'opacity-100' : 'opacity-0',
          )}
          icon={<MoreIcon size={14} />}
        />
      )}
    />
  );
}

interface SpaceTreeItemProps {
  /** Shows the hover "+" (new project) once the workspace is known. */
  workspaceId: string | undefined;
  space: SidebarSpace;
  /** The space's projects in the order shown (moves while a project is dragged). */
  projects: SidebarProject[];
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The space-level views of this space are showing. */
  active: boolean;
  activeProjectId: string | undefined;
  /** Admins and owners: drag to reorder, "⋯" → Rename. */
  canManage: boolean;
  /** Rendered under the row while dragging: the projects of this space (a SortableContext). */
  renderProjects: (children: ReactNode) => ReactNode;
}

/**
 * Space row (32px: chevron, 18px badge, 500 name) with its projects (30px, inset 34px, 6px dot).
 * The chevron expands/collapses; the name opens the space-level views (Calendar.dc.html, where
 * the active space row is accent-soft with an accent 600 name and projects show color dots).
 * Admins drag rows to reorder (not designed: the board's drag pattern) and rename from "⋯".
 */
export function SpaceTreeItem({
  workspaceId,
  space,
  projects,
  open,
  onToggle,
  active,
  activeProjectId,
  canManage,
  renderProjects,
}: SpaceTreeItemProps) {
  const { t } = useTranslation();
  const ws = useWsPath();
  const renaming = useUiStore((s) => s.renamingId === space.id);
  const setRenaming = useUiStore((s) => s.setRenaming);
  const rename = useRenameSpace(workspaceId ?? '');
  const { setNodeRef, handle, style, isDragging } = useSortableRow(
    `${SPACE_PREFIX}${space.id}`,
    !canManage || renaming,
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex flex-col gap-0.5', isDragging && 'opacity-40')}
    >
      <div
        className={cn(
          'group flex h-8 items-center rounded-[8px]',
          active ? 'bg-accent-soft' : 'hover:bg-nav-hover',
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={space.name}
          onClick={() => {
            onToggle(!open);
          }}
          className="flex h-8 w-7 flex-none items-center justify-end rounded-[8px] border-0 bg-transparent p-0 pr-1 text-icon"
        >
          <ChevronRightIcon
            size={12}
            className="transition-transform duration-150"
            style={{ transform: `rotate(${open ? 90 : 0}deg)` }}
          />
        </button>
        {renaming ? (
          <div className="flex h-8 min-w-0 flex-1 items-center gap-2 pr-2 pl-1">
            <SpaceBadge initial={space.initial} color={space.color} />
            <RenameField
              name={space.name}
              label={t('shell.renameSpace')}
              onSave={(name) => {
                rename.mutate({ spaceId: space.id, name });
              }}
            />
          </div>
        ) : (
          <Link
            to={ws(`/s/${space.id}/list`)}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              onToggle(true);
            }}
            {...handle}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[8px] pr-3 pl-1"
          >
            <SpaceBadge initial={space.initial} color={space.color} />
            <span
              className={cn(
                'flex-1 truncate',
                active ? 'font-semibold text-accent-ink' : 'font-medium text-2',
              )}
            >
              {space.name}
            </span>
          </Link>
        )}
        {canManage && !renaming && (
          <RowMenu
            label={t('shell.spaceOptions', { name: space.name })}
            onRename={() => {
              setRenaming(space.id);
            }}
          />
        )}
        {workspaceId && !renaming && <NewProjectButton workspaceId={workspaceId} space={space} />}
      </div>
      {open &&
        renderProjects(
          <div className="flex flex-col gap-0.5">
            {projects.map((project) => (
              <ProjectNavItem
                key={project.id}
                workspaceId={workspaceId ?? ''}
                project={project}
                active={project.id === activeProjectId}
                colorDot={active}
                canManage={canManage}
              />
            ))}
          </div>,
        )}
    </div>
  );
}

function ProjectNavItem({
  workspaceId,
  project,
  active,
  colorDot,
  canManage,
}: {
  workspaceId: string;
  project: SidebarProject;
  active: boolean;
  /** Space-level views show each project's color (8px) instead of the neutral dot. */
  colorDot: boolean;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const renaming = useUiStore((s) => s.renamingId === project.id);
  const setRenaming = useUiStore((s) => s.setRenaming);
  const rename = useRenameProject(workspaceId);
  const { setNodeRef, handle, style, isDragging } = useSortableRow(
    `${PROJECT_PREFIX}${project.id}`,
    !canManage || renaming,
  );
  const dot = colorDot ? (
    <ProjectDot color={project.color} size={8} />
  ) : (
    <ProjectDot color={active ? 'accent' : 'inactive'} />
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex h-[30px] items-center rounded-[8px]',
        active ? 'bg-accent-soft' : 'hover:bg-nav-hover',
        isDragging && 'opacity-40',
      )}
    >
      {renaming ? (
        <div className="flex h-[30px] min-w-0 flex-1 items-center gap-2 pr-2 pl-[34px]">
          {dot}
          <RenameField
            name={project.name}
            label={t('shell.renameProject')}
            onSave={(name) => {
              rename.mutate({ projectId: project.id, name });
            }}
          />
        </div>
      ) : (
        <ProjectLink project={project} active={active} handle={handle}>
          {dot}
        </ProjectLink>
      )}
      {canManage && !renaming && (
        <span className="mr-1 flex">
          <RowMenu
            label={t('shell.projectOptions', { name: project.name })}
            onRename={() => {
              setRenaming(project.id);
            }}
          />
        </span>
      )}
    </div>
  );
}

function ProjectLink({
  project,
  active,
  handle,
  children,
}: {
  project: SidebarProject;
  active: boolean;
  handle: object;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const ws = useWsPath();
  const [now] = useState(() => Date.now());
  const isNew = now - Date.parse(project.createdAt) <= NEW_PROJECT_MS;
  return (
    <Link
      to={ws(`/p/${project.id}/list`)}
      aria-current={active ? 'page' : undefined}
      {...handle}
      className={cn(
        'flex h-[30px] min-w-0 flex-1 items-center gap-2 rounded-[8px] pr-3 pl-[34px] text-[13px]',
        active ? 'font-medium text-accent-ink' : 'text-2',
      )}
    >
      {children}
      <span className="flex-1 truncate">{project.name}</span>
      {isNew && (
        <span className="ml-auto rounded-[4px] bg-surface px-1.5 text-[11px] font-medium text-accent-ink">
          {t('shell.newBadge')}
        </span>
      )}
    </Link>
  );
}

/** The lifted row under the pointer while dragging (DragOverlay). */
export function DragRow({ item }: { item: SidebarSpace | SidebarProject }) {
  const isSpace = 'initial' in item;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[8px] bg-surface pr-3 shadow-popover',
        isSpace ? 'h-8 pl-8 font-medium text-2' : 'h-[30px] pl-[34px] text-[13px] text-2',
      )}
    >
      {isSpace ? (
        <SpaceBadge initial={item.initial} color={item.color} />
      ) : (
        <ProjectDot color={item.color} size={8} />
      )}
      <span className="truncate">{item.name}</span>
    </div>
  );
}
