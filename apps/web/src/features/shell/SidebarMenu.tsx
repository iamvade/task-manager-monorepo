import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from '../../components/icons';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';
import { NavCustomizePopover } from './NavCustomizePopover';
import { NavItem } from './NavItem';
import { useNavLayout, type NavEntry } from './useNavEntries';

/**
 * Sidebar's top links (not designed beyond Main.dc.html's list): Inbox, My Tasks, Personal and
 * Standup always, then the optional links the user put in the short list; the rest sit under
 * "More". The filter button edits which optional links are shown. A hidden link whose page is
 * open stays visible so the current page is always in the list.
 */
export function SidebarMenu() {
  const { t } = useTranslation();
  const { entries, shortList, hidden } = useNavLayout();
  const moreOpen = useUiStore((s) => s.navMoreOpen);
  const setMoreOpen = useUiStore((s) => s.setNavMoreOpen);
  const moreId = useId();

  const pinnedActive = moreOpen ? [] : hidden.filter((e) => e.active);
  const collapsedBadges = moreOpen ? [] : hidden.filter((e) => !e.active && e.badge);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center justify-between pr-1 pl-3">
        <span className="text-[12px] font-medium text-muted">{t('shell.menu')}</span>
        <NavCustomizePopover entries={entries} />
      </div>
      {[...shortList, ...pinnedActive].map((entry) => (
        <Entry key={entry.key} entry={entry} />
      ))}
      {hidden.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={moreId}
            aria-label={
              collapsedBadges.length > 0
                ? `${t('shell.more')}, ${collapsedBadges.map((e) => e.badge).join(', ')}`
                : undefined
            }
            onClick={() => {
              setMoreOpen(!moreOpen);
            }}
            className="flex h-8 items-center gap-2 rounded-[8px] border-0 bg-transparent px-3 text-left text-2 hover:bg-nav-hover"
          >
            <ChevronDownIcon
              size={16}
              className={cn('flex-none text-icon transition-transform', moreOpen && 'rotate-180')}
            />
            <span className="flex-1 truncate font-medium">
              {moreOpen ? t('shell.less') : t('shell.more')}
            </span>
            {collapsedBadges.length > 0 && (
              <span aria-hidden className="size-2 flex-none rounded-full bg-accent" />
            )}
          </button>
          <div id={moreId} hidden={!moreOpen} className="flex flex-col gap-0.5">
            {moreOpen && hidden.map((entry) => <Entry key={entry.key} entry={entry} />)}
          </div>
        </>
      )}
    </div>
  );
}

function Entry({ entry }: { entry: NavEntry }) {
  return <NavItem to={entry.to} icon={entry.icon} label={entry.label} trailing={entry.trailing} />;
}
