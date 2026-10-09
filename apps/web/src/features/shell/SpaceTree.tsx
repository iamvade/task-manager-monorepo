import type { SidebarProject, SidebarSpace } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronRightIcon } from '../../components/icons';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { cn } from '../../lib/cn';

const NEW_PROJECT_MS = 7 * 86_400_000;

interface SpaceTreeItemProps {
  space: SidebarSpace;
  open: boolean;
  onToggle: (open: boolean) => void;
  /** The space-level views of this space are showing. */
  active: boolean;
  activeProjectId: string | undefined;
}

/**
 * Space row (32px: chevron, 18px badge, 500 name) with its projects (30px, inset 34px, 6px dot).
 * The chevron expands/collapses; the name opens the space-level views (Calendar.dc.html, where
 * the active space row is accent-soft with an accent 600 name and projects show color dots).
 */
export function SpaceTreeItem({
  space,
  open,
  onToggle,
  active,
  activeProjectId,
}: SpaceTreeItemProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <div
        className={cn(
          'flex h-8 items-center rounded-[8px]',
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
        <Link
          to={`/s/${space.id}/list`}
          aria-current={active ? 'page' : undefined}
          onClick={() => {
            onToggle(true);
          }}
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
      </div>
      {open && (
        <div className="flex flex-col gap-0.5">
          {space.projects.map((project) => (
            <ProjectNavItem
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
              colorDot={active}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectNavItem({
  project,
  active,
  colorDot,
}: {
  project: SidebarProject;
  active: boolean;
  /** Space-level views show each project's color (8px) instead of the neutral dot. */
  colorDot: boolean;
}) {
  const { t } = useTranslation();
  const [now] = useState(() => Date.now());
  const isNew = now - Date.parse(project.createdAt) <= NEW_PROJECT_MS;
  return (
    <Link
      to={`/p/${project.id}/list`}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[30px] items-center gap-2 rounded-[8px] pr-3 pl-[34px] text-[13px]',
        active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-2 hover:bg-nav-hover',
      )}
    >
      {colorDot ? (
        <ProjectDot color={project.color} size={8} />
      ) : (
        <ProjectDot color={active ? 'accent' : 'inactive'} />
      )}
      <span className="flex-1 truncate">{project.name}</span>
      {isNew && (
        <span className="ml-auto rounded-[4px] bg-surface px-1.5 text-[11px] font-medium text-accent-ink">
          {t('shell.newBadge')}
        </span>
      )}
    </Link>
  );
}
