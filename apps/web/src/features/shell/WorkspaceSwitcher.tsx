import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ChevronsUpDownIcon } from '../../components/icons';
import { Menu } from '../../components/ui/Menu';
import { WorkspaceTile } from '../../components/ui/WorkspaceTile';
import { useCurrentWorkspace } from '../../api/workspaces';
import { useUiStore } from '../../stores/ui';

/** "K Kite Studio ⇅" button (36px) opening a menu of the user's workspaces. */
export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const current = useCurrentWorkspace();
  const setLastWorkspace = useUiStore((s) => s.setLastWorkspace);
  if (!current) return null;

  return (
    <Menu
      label={t('shell.switchWorkspace')}
      items={(me?.workspaces ?? []).map((w) => ({
        id: w.id,
        label: w.name,
        checked: w.id === current.id,
        onSelect: () => {
          setLastWorkspace(w.id);
        },
      }))}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`${current.name} — ${t('shell.switchWorkspace')}`}
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[8px] border-0 bg-transparent px-2 text-left hover:bg-hover"
        >
          <WorkspaceTile name={current.name} />
          <span className="flex-1 truncate text-[14px] font-semibold">{current.name}</span>
          <ChevronsUpDownIcon size={14} className="flex-none text-icon" />
        </button>
      )}
    />
  );
}
