import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { useUnreadCounts } from '../../api/notifications';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ChevronsUpDownIcon } from '../../components/icons';
import { CountBadge } from '../../components/ui/CountBadge';
import { Menu } from '../../components/ui/Menu';
import { WorkspaceTile } from '../../components/ui/WorkspaceTile';
import { switchTarget } from '../../lib/paths';

/** The accent dot on the tile: unread notifications in another workspace. */
function UnreadDot() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-1 -right-1 box-content size-2 rounded-full border-2 border-solid border-[var(--bg-sidebar)] bg-accent"
    />
  );
}

/**
 * "K Kite Studio ⇅" button (36px; the rail shows just the 28px tile) opening a menu of my
 * workspaces, each with its unread count. Not in the designs beyond the button.
 */
export function WorkspaceSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'rail' }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const current = useCurrentWorkspace();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const workspaces = me?.workspaces ?? [];
  const counts = useUnreadCounts(workspaces.length > 1).data;
  if (!current) return null;

  const unreadIn = (id: string) => counts?.find((c) => c.workspaceId === id)?.unread ?? 0;
  const elsewhere = workspaces.some((w) => w.id !== current.id && unreadIn(w.id) > 0);
  const label = [
    `${current.name} — ${t('shell.switchWorkspace')}`,
    ...(elsewhere ? [t('shell.unreadElsewhere')] : []),
  ].join('. ');

  return (
    <Menu
      label={t('shell.switchWorkspace')}
      width={240}
      items={workspaces.map((w) => {
        const unread = w.id === current.id ? 0 : unreadIn(w.id);
        return {
          id: w.id,
          label: w.name,
          checked: w.id === current.id,
          trailing:
            unread > 0 ? (
              <CountBadge
                value={unread}
                tone="accent"
                label={t('shell.unread', { count: unread })}
              />
            ) : undefined,
          onSelect: () => {
            if (w.id !== current.id) void navigate(switchTarget(w.slug, pathname));
          },
        };
      })}
      trigger={(props) =>
        variant === 'rail' ? (
          <button
            type="button"
            {...props}
            aria-label={label}
            className="relative flex size-9 flex-none items-center justify-center rounded-[8px] border-0 bg-transparent p-0 hover:bg-hover"
          >
            <span className="relative flex">
              <WorkspaceTile name={current.name} size={28} />
              {elsewhere && <UnreadDot />}
            </span>
          </button>
        ) : (
          <button
            type="button"
            {...props}
            aria-label={label}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[8px] border-0 bg-transparent px-2 text-left hover:bg-hover"
          >
            <span className="relative flex">
              <WorkspaceTile name={current.name} />
              {elsewhere && <UnreadDot />}
            </span>
            <span className="flex-1 truncate text-[14px] font-semibold">{current.name}</span>
            <ChevronsUpDownIcon size={14} className="flex-none text-icon" />
          </button>
        )
      }
    />
  );
}
