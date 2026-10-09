import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../../components/icons';
import { Kbd } from '../../components/ui/Kbd';
import { isMac } from '../../lib/keyboard';
import { useUiStore } from '../../stores/ui';

/**
 * 32px search field with the ⌘K hint (control bg, #1B1B1E in dark). It opens the command
 * palette, where the search happens.
 */
export function SidebarSearch() {
  const { t } = useTranslation();
  const openPalette = useUiStore((s) => s.setPaletteOpen);
  return (
    <div className="px-1">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          openPalette(true);
        }}
        className="box-border flex h-8 w-full items-center gap-2 rounded-[8px] border border-control bg-control-sidebar px-2 text-left text-[13px] text-muted"
      >
        <SearchIcon size={14} className="flex-none text-icon" />
        <span className="min-w-0 flex-1 truncate">{t('shell.search')}</span>
        <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
      </button>
    </div>
  );
}
