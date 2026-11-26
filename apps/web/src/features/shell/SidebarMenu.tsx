import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterIcon, MoreIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Menu } from '../../components/ui/Menu';
import { cn } from '../../lib/cn';
import { CustomizeSidebarDialog } from './CustomizeSidebarDialog';
import { useMoreMenu } from './moreMenu';
import { NavItem } from './NavItem';
import { useNavLayout } from './useNavEntries';

/**
 * Sidebar's top links (not designed beyond Main.dc.html's list): Inbox and My Tasks always,
 * then the optional links the user shows (Personal and Standup by default; "Show when badged"
 * ones while they have a badge). "More" opens a menu with the rest and "Customize sidebar…";
 * the filter button opens the same dialog. A hidden link whose page is open stays listed.
 */
export function SidebarMenu() {
  const { t } = useTranslation();
  const { shortList, hidden } = useNavLayout();
  const [customizing, setCustomizing] = useState(false);
  const more = useMoreMenu(hidden, () => {
    setCustomizing(true);
  });

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center justify-between pr-1 pl-3">
        <span className="text-[12px] font-medium text-muted">{t('shell.menu')}</span>
        <IconButton
          label={t('shell.customizeSidebar')}
          size={24}
          className="text-muted"
          onClick={() => {
            setCustomizing(true);
          }}
          icon={<FilterIcon size={14} />}
        />
      </div>
      {shortList.map((entry) => (
        <NavItem
          key={entry.key}
          to={entry.to}
          icon={entry.icon}
          label={entry.label}
          trailing={entry.trailing}
        />
      ))}
      <Menu
        label={t('shell.more')}
        placement="bottom-start"
        width={260}
        items={more.items}
        trigger={(props, open) => (
          <button
            {...props}
            type="button"
            aria-label={more.label}
            className={cn(
              'flex h-8 items-center gap-2 rounded-[8px] border-0 bg-transparent px-3 text-left text-2 hover:bg-nav-hover',
              open && 'bg-nav-hover',
            )}
          >
            <MoreIcon size={16} className="flex-none text-icon" />
            <span className="flex-1 truncate font-medium">{t('shell.more')}</span>
            {more.hasBadge && (
              <span aria-hidden className="size-2 flex-none rounded-full bg-accent" />
            )}
          </button>
        )}
      />
      <CustomizeSidebarDialog
        open={customizing}
        onClose={() => {
          setCustomizing(false);
        }}
      />
    </div>
  );
}
