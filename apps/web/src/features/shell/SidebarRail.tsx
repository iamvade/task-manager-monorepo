import { useTranslation } from 'react-i18next';
import { Link, NavLink, useNavigate } from 'react-router';
import { useCurrentWorkspace, useSidebar, useWsPath } from '../../api/workspaces';
import { MoreIcon, PanelOpenIcon, SearchIcon } from '../../components/icons';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { SpaceBadge } from '../../components/ui/SpaceBadge';
import { Tooltip } from '../../components/ui/Tooltip';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import { useNavLayout, type NavEntry } from './useNavEntries';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

const railButton = 'flex size-9 items-center justify-center rounded-[8px] text-3 hover:bg-hover';

/** Collapsed sidebar: 56px icon rail (Main.dc.html). */
export function SidebarRail() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const ws = useWsPath();
  const sidebar = useSidebar(workspace?.id);
  const { shortList, hidden } = useNavLayout();
  const pinnedActive = hidden.filter((e) => e.active);
  const more = hidden.filter((e) => !e.active);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  const openPalette = useUiStore((s) => s.setPaletteOpen);

  return (
    <nav
      aria-label={t('shell.workspace')}
      className="relative box-border flex h-full w-14 flex-none flex-col items-center gap-2 overflow-y-auto border-r border-default bg-sidebar py-3"
    >
      <WorkspaceSwitcher variant="rail" />
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
      {[...shortList, ...pinnedActive].map((entry) => (
        <RailLink key={entry.key} to={entry.to} label={entry.label} badge={entry.badge}>
          {entry.icon}
        </RailLink>
      ))}
      {more.length > 0 && <RailMore entries={more} />}
      <div className="my-1 h-px w-6 bg-[var(--border)]" />
      {sidebar.data?.spaces.map((space) => (
        <Tooltip key={space.id} content={space.name} placement="right">
          {(props) => (
            <Link
              {...props}
              to={ws(`/s/${space.id}/list`)}
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
  badge,
  children,
}: {
  to: string;
  label: string;
  /** Accessible text of an accent dot in the corner ("3 unread"). */
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label} placement="right">
      {(props) => (
        <NavLink
          {...props}
          to={to}
          aria-label={badge ? `${label}, ${badge}` : label}
          className={({ isActive }) =>
            cn(
              railButton,
              'relative',
              isActive && 'bg-accent-soft text-accent-ink hover:bg-accent-soft',
            )
          }
        >
          {children}
          {badge && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg-sidebar)]" />
          )}
        </NavLink>
      )}
    </Tooltip>
  );
}

/** Rail "More": the optional links not in the short list, as a menu (dot when one needs attention). */
function RailMore({ entries }: { entries: NavEntry[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const badges = entries.filter((e) => e.badge).map((e) => e.badge);
  const label = badges.length > 0 ? `${t('shell.more')}, ${badges.join(', ')}` : t('shell.more');
  return (
    <Menu
      label={t('shell.more')}
      placement="right-start"
      width={200}
      items={entries.map((entry) => ({
        id: entry.key,
        label: entry.label,
        icon: entry.icon,
        trailing: entry.trailing,
        onSelect: () => {
          void navigate(entry.to);
        },
      }))}
      trigger={(props, open) => (
        <button
          {...props}
          type="button"
          aria-label={label}
          className={cn(railButton, 'relative border-0 bg-transparent', open && 'bg-hover')}
        >
          <MoreIcon size={16} />
          {badges.length > 0 && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent shadow-[0_0_0_2px_var(--bg-sidebar)]" />
          )}
        </button>
      )}
    />
  );
}
