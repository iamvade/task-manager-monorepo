import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownIcon, ArrowUpIcon, FilterIcon } from '../../components/icons';
import { Checkbox } from '../../components/ui/Checkbox';
import { IconButton } from '../../components/ui/IconButton';
import { Popover } from '../../components/ui/Popover';
import { useUiStore } from '../../stores/ui';
import { moveNav } from './navItems';
import type { NavEntry } from './useNavEntries';
import type { NavKey } from './navItems';

/**
 * "Customize menu" (sidebar filter button; not designed): which optional links (Personal,
 * Standup, Outlook, Feedback, Reports) join the short list, and their order. Inbox and My Tasks
 * are fixed and not listed. Changes apply at once.
 */
export function NavCustomizePopover({ entries }: { entries: Record<NavKey, NavEntry> }) {
  const { t } = useTranslation();
  const prefs = useUiStore((s) => s.navItems);
  const setNavItems = useUiStore((s) => s.setNavItems);
  const resetNav = useUiStore((s) => s.resetNav);
  const headingId = useId();

  return (
    <Popover
      label={t('shell.customizeMenu')}
      placement="bottom-end"
      width={248}
      elevation="lg"
      trigger={(props, open) => (
        <IconButton
          {...props}
          label={t('shell.customizeMenu')}
          size={24}
          className={open ? 'bg-hover text-default' : 'text-muted'}
          icon={<FilterIcon size={14} />}
        />
      )}
    >
      <div className="flex flex-col gap-1 p-1">
        <h2 id={headingId} className="m-0 px-2 pt-1 text-[13px] font-semibold text-default">
          {t('shell.customizeMenu')}
        </h2>
        <p className="m-0 px-2 pb-1 text-[12px] text-muted">{t('shell.customizeMenuHint')}</p>
        <ul aria-labelledby={headingId} className="m-0 flex list-none flex-col p-0">
          {prefs.map((pref, index) => {
            const entry = entries[pref.key];
            return (
              <li key={pref.key} className="flex h-8 items-center gap-2 rounded-[6px] pr-1 pl-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-[13px] text-default">
                  <Checkbox
                    checked={pref.shown}
                    label={t('shell.showInMenu', { name: entry.label })}
                    onChange={(shown) => {
                      setNavItems(prefs.map((p) => (p.key === pref.key ? { ...p, shown } : p)));
                    }}
                  />
                  <span className="flex-none text-icon">{entry.icon}</span>
                  <span className="truncate">{entry.label}</span>
                </label>
                <IconButton
                  label={`${t('shell.moveUp')}: ${entry.label}`}
                  size={24}
                  disabled={index === 0}
                  onClick={() => {
                    setNavItems(moveNav(prefs, index, -1));
                  }}
                  icon={<ArrowUpIcon size={12} />}
                />
                <IconButton
                  label={`${t('shell.moveDown')}: ${entry.label}`}
                  size={24}
                  disabled={index === prefs.length - 1}
                  onClick={() => {
                    setNavItems(moveNav(prefs, index, 1));
                  }}
                  icon={<ArrowDownIcon size={12} />}
                />
              </li>
            );
          })}
        </ul>
        <div className="mt-1 border-t border-default pt-1">
          <button
            type="button"
            onClick={resetNav}
            className="flex h-8 w-full items-center rounded-[6px] border-0 bg-transparent px-2 text-left text-[13px] text-2 hover:bg-hover"
          >
            {t('shell.resetMenu')}
          </button>
        </div>
      </div>
    </Popover>
  );
}
