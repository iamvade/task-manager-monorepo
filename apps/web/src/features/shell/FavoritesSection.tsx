import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { cn } from '../../lib/cn';
import { useShellLocation } from './useShellLocation';

/**
 * "Favorites" sidebar section (derived, not in the designs): the projects I starred in the
 * project header, by name, as 30px rows with the project's color dot. Hidden when there are none.
 */
export function FavoritesSection() {
  const { t } = useTranslation();
  const ws = useWsPath();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const { projectId } = useShellLocation();
  const favorites = sidebar.data?.favorites ?? [];
  if (favorites.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center pr-1 pl-3">
        <span id="sidebar-favorites" className="text-[12px] font-medium text-muted">
          {t('shell.favorites')}
        </span>
      </div>
      <ul aria-labelledby="sidebar-favorites" className="flex flex-col gap-0.5">
        {favorites.map((p) => {
          const active = p.id === projectId;
          return (
            <li key={p.id}>
              <Link
                to={ws(`/p/${p.id}/list`)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[30px] items-center gap-2 rounded-[8px] px-3 text-[13px]',
                  active ? 'bg-nav-hover font-medium text-default' : 'text-2 hover:bg-nav-hover',
                )}
              >
                <ProjectDot color={p.color} size={8} />
                <span className="truncate">{p.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
