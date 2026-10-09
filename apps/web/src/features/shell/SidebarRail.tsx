import { useTranslation } from 'react-i18next';
import { Link, NavLink } from 'react-router';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { InboxIcon, MyTasksIcon, PanelOpenIcon, SearchIcon } from '../../components/icons';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { IconButton } from '../../components/ui/IconButton';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { Tooltip } from '../../components/ui/Tooltip';
import { WorkspaceTile } from '../../components/ui/WorkspaceTile';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';

const railButton = 'flex size-9 items-center justify-center rounded-[8px] text-3 hover:bg-hover';

/** Collapsed sidebar: 56px icon rail (Main.dc.html). */
export function SidebarRail() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const sidebar = useSidebar(workspace?.id);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const openPalette = useUiStore((s) => s.setPaletteOpen);

  return (
    <nav
      aria-label={t('shell.workspace')}
      className="box-border flex h-full w-14 flex-none flex-col items-center gap-2 overflow-y-auto border-r border-default bg-sidebar py-3"
    >
      {workspace && <WorkspaceTile name={workspace.name} size={28} />}
      <IconButton
        label={t('shell.expand')}
        size={36}
        onClick={toggleSidebar}
        icon={<PanelOpenIcon size={16} />}
      />
      <IconButton
        label={t('shell.search')}
        size={36}
        onClick={() => {
          openPalette(true);
        }}
        icon={<SearchIcon size={16} />}
      />
      <RailLink to="/my-tasks" label={t('shell.myTasks')}>
        <MyTasksIcon size={16} />
      </RailLink>
      <RailLink to="/inbox" label={t('shell.inbox')}>
        <InboxIcon size={16} />
      </RailLink>
      <div className="my-1 h-px w-6 bg-[var(--border)]" />
      {sidebar.data?.spaces.map((space) => (
        <Tooltip key={space.id} content={space.name} placement="right">
          {(props) => (
            <Link
              {...props}
              to={`/s/${space.id}/list`}
              aria-label={space.name}
              className={railButton}
            >
              <SpaceBadge initial={space.initial} color={space.color} size={22} />
            </Link>
          )}
        </Tooltip>
      ))}
      <span className="flex-1" />
      <LanguageSwitcher variant="cycle" />
    </nav>
  );
}

function RailLink({
  to,
  label,
  children,
}: {
  to: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label} placement="right">
      {(props) => (
        <NavLink
          {...props}
          to={to}
          aria-label={label}
          className={({ isActive }) =>
            cn(railButton, isActive && 'bg-accent-soft text-accent-ink hover:bg-accent-soft')
          }
        >
          {children}
        </NavLink>
      )}
    </Tooltip>
  );
}
