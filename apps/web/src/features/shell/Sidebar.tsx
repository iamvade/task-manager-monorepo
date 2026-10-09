import type { SidebarResponse } from '@kite/shared';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import {
  GlobeIcon,
  InboxIcon,
  MyTasksIcon,
  PanelCloseIcon,
  SettingsIcon,
  UserPlusIcon,
} from '../../components/icons';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/Button';
import { CountBadge } from '../../components/ui/CountBadge';
import { IconButton } from '../../components/ui/IconButton';
import { Skeleton } from '../../components/ui/Skeleton';
import { useUiStore } from '../../stores/ui';
import { NavItem } from './NavItem';
import { NewSpaceButton } from './NewSpaceButton';
import { SidebarSearch } from './SidebarSearch';
import { SpaceTreeItem } from './SpaceTree';
import { useShellLocation } from './useShellLocation';
import { SidebarUser } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/** Expanded sidebar (Main.dc.html): 248px (min 220), --bg-sidebar, gap 16, padding 12/8. */
export function Sidebar() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <nav
      aria-label={t('shell.workspace')}
      className="box-border flex h-full w-[248px] min-w-[220px] flex-shrink flex-col gap-4 overflow-y-auto border-r border-default bg-sidebar px-2 py-3"
    >
      <div className="flex items-center gap-2 px-1">
        <WorkspaceSwitcher />
        <IconButton
          label={t('shell.collapse')}
          size={32}
          onClick={toggleSidebar}
          icon={<PanelCloseIcon size={16} />}
        />
      </div>

      <SidebarSearch />

      <div className="flex flex-col gap-0.5">
        <NavItem
          to="/my-tasks"
          icon={<MyTasksIcon size={16} />}
          label={t('shell.myTasks')}
          trailing={
            sidebar.data && (
              <span
                aria-label={t('shell.openTasks', { count: sidebar.data.myTasksCount })}
                className="text-[12px] text-muted [[aria-current=page]_&]:font-medium [[aria-current=page]_&]:text-accent-ink"
              >
                {sidebar.data.myTasksCount}
              </span>
            )
          }
        />
        <NavItem
          to="/inbox"
          icon={<InboxIcon size={16} />}
          label={t('shell.inbox')}
          trailing={
            sidebar.data && sidebar.data.inboxUnreadCount > 0 ? (
              <CountBadge
                tone="accent"
                value={sidebar.data.inboxUnreadCount}
                label={t('shell.unread', { count: sidebar.data.inboxUnreadCount })}
              />
            ) : null
          }
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex h-7 items-center justify-between pr-1 pl-3">
          <span className="text-[12px] font-medium text-muted">{t('shell.spaces')}</span>
          {workspace && (
            <NewSpaceButton
              workspaceId={workspace.id}
              spaceCount={sidebar.data?.spaces.length ?? 0}
            />
          )}
        </div>
        <SpaceList query={sidebar} />
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-default pt-2">
        <div className="flex h-9 items-center gap-2 pr-2 pl-3">
          <GlobeIcon size={16} className="flex-none text-2" />
          <span id="sidebar-lang-label" className="flex-1 font-medium text-2">
            {t('shell.language')}
          </span>
          <LanguageSwitcher track="sidebar" labelledBy="sidebar-lang-label" />
        </div>
        <FooterLink to="/settings?tab=members" icon={<UserPlusIcon size={16} />}>
          {t('shell.invite')}
        </FooterLink>
        <FooterLink to="/settings" icon={<SettingsIcon size={16} />}>
          {t('shell.settings')}
        </FooterLink>
        <SidebarUser />
      </div>
    </nav>
  );
}

function FooterLink({
  to,
  icon,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end
      className="flex h-8 items-center gap-2 rounded-[8px] px-3 font-medium text-2 hover:bg-nav-hover"
    >
      {icon}
      {children}
    </NavLink>
  );
}

function SpaceList({ query }: { query: ReturnType<typeof useSidebar> }) {
  const { t } = useTranslation();
  const { projectId, spaceId } = useShellLocation();
  const openSpaces = useUiStore((s) => s.openSpaces);
  const setSpaceOpen = useUiStore((s) => s.setSpaceOpen);
  const activeSpaceId = activeProjectSpace(query.data, projectId) ?? spaceId;

  // Opening a project or space (e.g. from a link) expands its space once.
  useEffect(() => {
    if (activeSpaceId && openSpaces[activeSpaceId] === undefined) setSpaceOpen(activeSpaceId, true);
  }, [activeSpaceId, openSpaces, setSpaceOpen]);

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 px-3 py-2">
        {[64, 88, 56].map((w) => (
          <div key={w} className="flex items-center gap-2">
            <Skeleton width={18} height={18} />
            <Skeleton width={w} height={10} />
          </div>
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-2 px-3 py-2 text-[12px] text-muted"
      >
        {t('shell.loadError')}
        <Button size="sm" onClick={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    );
  }
  return (
    <>
      {query.data.spaces.map((space) => (
        <SpaceTreeItem
          key={space.id}
          space={space}
          open={openSpaces[space.id] ?? space.id === activeSpaceId}
          onToggle={(open) => {
            setSpaceOpen(space.id, open);
          }}
          active={space.id === spaceId}
          activeProjectId={projectId}
        />
      ))}
    </>
  );
}

function activeProjectSpace(data: SidebarResponse | undefined, projectId: string | undefined) {
  if (!data || !projectId) return undefined;
  return data.spaces.find((s) => s.projects.some((p) => p.id === projectId))?.id;
}
