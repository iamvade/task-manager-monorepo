import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import {
  CloseIcon,
  GlobeIcon,
  FeedbackIcon,
  InboxIcon,
  MyTasksIcon,
  PanelCloseIcon,
  ReportsIcon,
  SettingsIcon,
  UserPlusIcon,
} from '../../components/icons';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { CountBadge } from '../../components/ui/CountBadge';
import { IconButton } from '../../components/ui/IconButton';
import { useUiStore } from '../../stores/ui';
import { StandupGroupsSection, StandupNavItem } from '../standup/StandupNav';
import { NavItem } from './NavItem';
import { NewSpaceButton } from './NewSpaceButton';
import { SidebarSearch } from './SidebarSearch';
import { SpaceList } from './SpaceList';
import { SidebarUser } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * Expanded sidebar (Main.dc.html): 248px (min 220), --bg-sidebar, gap 16, padding 12/8.
 * In the phone sheet, `onClose` replaces "Collapse sidebar" with closing the sheet.
 */
export function Sidebar({ onClose }: { onClose?: () => void } = {}) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const ws = useWsPath();
  const sidebar = useSidebar(workspace?.id);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  return (
    <nav
      aria-label={t('shell.workspace')}
      className="box-border flex h-full w-[248px] min-w-[220px] flex-shrink flex-col gap-4 overflow-y-auto border-r border-default bg-sidebar px-2 py-3"
    >
      <div className="flex items-center gap-2 px-1">
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

      <div className="flex flex-col gap-0.5">
        <NavItem
          to={ws('/my-tasks')}
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
        <StandupNavItem />
        <NavItem
          to={ws('/inbox')}
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
        <NavItem
          to={ws('/feedback')}
          icon={<FeedbackIcon size={16} />}
          label={t('shell.feedback')}
          trailing={
            sidebar.data && sidebar.data.feedbackUnreadCount > 0 ? (
              <CountBadge
                tone="accent"
                value={sidebar.data.feedbackUnreadCount}
                label={t('shell.feedbackNew', { count: sidebar.data.feedbackUnreadCount })}
              />
            ) : null
          }
        />
        <NavItem to={ws('/reports')} icon={<ReportsIcon size={16} />} label={t('shell.reports')} />
      </div>

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
