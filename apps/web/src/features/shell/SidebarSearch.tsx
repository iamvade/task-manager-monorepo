import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SearchIcon } from '../../components/icons';
import { Kbd } from '../../components/ui/Kbd';

/**
 * 32px search field with the ⌘K hint (control bg, #1B1B1E in dark). ⌘K focuses it until the
 * command palette arrives (phase 12).
 */
export const SidebarSearch = forwardRef<HTMLInputElement>(function SidebarSearch(_props, ref) {
  const { t } = useTranslation();
  return (
    <div className="px-1">
      <label className="flex h-8 items-center gap-2 rounded-[8px] border border-control bg-control-sidebar px-2 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-accent-ink">
        <SearchIcon size={14} className="flex-none text-icon" />
        <span className="sr-only">{t('shell.search')}</span>
        <input
          ref={ref}
          type="search"
          placeholder={t('shell.search')}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none placeholder:text-muted focus-visible:outline-none"
        />
        <Kbd>⌘K</Kbd>
      </label>
    </div>
  );
});
