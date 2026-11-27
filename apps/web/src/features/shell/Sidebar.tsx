import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import {
  CloseIcon,
  GlobeIcon,
  PanelCloseIcon,
  SettingsIcon,
  UserPlusIcon,
} from '../../components/icons';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { IconButton } from '../../components/ui/IconButton';
import { KiteMark } from '../../components/ui/KiteMark';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import { StandupGroupsSection } from '../standup/StandupNav';
import { FavoritesSection } from './FavoritesSection';
import { NewSpaceButton } from './NewSpaceButton';
import { SidebarMenu } from './SidebarMenu';
import { LIVE_WIDTH_VAR } from './SidebarResizer';
import { SidebarSearch } from './SidebarSearch';
import { SpaceList } from './SpaceList';
import { SidebarUser } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * Expanded sidebar (Main.dc.html): 248px by default, resizable 220–420px by dragging its right
 * border (`SidebarResizer`); --bg-sidebar, gap 16, padding 12/8.
 * In the phone sheet, `onClose` replaces "Collapse sidebar" with closing the sheet (fixed 248px).
 */
export function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const ws = useWsPath();
  const sidebar = useSidebar(workspace?.id);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const width = useUiStore((s) => s.sidebarWidth);

  return (
    <nav
      aria-label={t('shell.workspace')}
      style={onClose ? undefined : { width: `var(${LIVE_WIDTH_VAR}, ${width}px)` }}
      className={cn(
        'relative box-border flex h-full flex-col gap-4 overflow-y-auto border-r border-default bg-sidebar px-2 py-3',
        onClose ? 'w-[248px] min-w-[220px] flex-shrink' : 'flex-none',
      )}
    >
      <div className="flex items-center gap-1 px-1">
        <div className="flex h-9 min-w-0 flex-1 items-center gap-2 px-2">
          <KiteMark className="size-5 flex-none text-default" />
          <span className="truncate text-[14px] font-semibold">Kite</span>
        </div>
        <WorkspaceSwitcher />
        {onClose ? (
          <IconButton
            label={t('shell.closeNavigation')}
            size={32}
            onClick={onClose}
            icon={<CloseIcon size={16} />}
          />
        ) : (
          <IconButton
            label={t('shell.collapse')}
            size={32}
            onClick={toggleSidebar}
            icon={<PanelCloseIcon size={16} />}
          />
        )}
      </div>

      <SidebarSearch />

      <SidebarMenu />

      <FavoritesSection />

      <StandupGroupsSection />

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
        <SpaceList query={sidebar} workspaceId={workspace?.id} />
      </div>

      <div className="mt-auto flex flex-col gap-0.5 border-t border-default pt-2">
        <div className="flex h-9 items-center gap-2 pr-2 pl-3">
          <GlobeIcon size={16} className="flex-none text-2" />
          <span id="sidebar-lang-label" className="flex-1 font-medium text-2">
            {t('shell.language')}
          </span>
          <LanguageSwitcher track="sidebar" labelledBy="sidebar-lang-label" />
        </div>
        <FooterLink to={ws('/settings?tab=members')} icon={<UserPlusIcon size={16} />}>
          {t('shell.invite')}
        </FooterLink>
        <FooterLink to={ws('/settings')} icon={<SettingsIcon size={16} />}>
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
