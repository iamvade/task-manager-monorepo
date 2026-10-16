import type { StandupGroup } from '@kite/shared';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ChevronDownIcon, UsersIcon } from '../../components/icons';
import { Picker } from '../../components/ui/Picker';
import { Popover } from '../../components/ui/Popover';

/**
 * Standup page header (Standup*.dc.html): min 64px, padding 12/24, bottom border. On a phone
 * (under 640px) the gutters are 16px and the left side wraps.
 */
export function StandupHeader({ left, right }: { left: ReactNode; right?: ReactNode }) {
  return (
    <header className="box-border flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-default px-6 py-3 max-sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3 max-sm:gap-2">{left}</div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  );
}

/**
 * Group switcher: 36px outline button (name 14/600 + chevron; Standup.dc.html adds the accent
 * users icon, StandupEmpty.dc.html doesn't) opening a listbox of every group.
 */
export function GroupSwitcher({
  group,
  groups,
  icon = true,
}: {
  group: StandupGroup;
  groups: readonly StandupGroup[];
  icon?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const items = groups.some((g) => g.id === group.id) ? groups : [group, ...groups];
  const label = t('standup.switchGroup');
  return (
    <Popover
      label={label}
      width={260}
      elevation="lg"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-haspopup="listbox"
          aria-label={`${label}: ${group.name}`}
          className="flex h-9 max-w-[320px] min-w-0 items-center gap-2 rounded-[8px] border border-default bg-surface px-2.5 text-[14px] font-semibold text-default hover:bg-hover"
        >
          {icon && <UsersIcon size={16} className="flex-none text-accent-ink" />}
          <span className="truncate">{group.name}</span>
          <ChevronDownIcon size={12} strokeWidth={2.5} className="flex-none text-icon" />
        </button>
      )}
    >
      {(close) => (
        <Picker<StandupGroup>
          items={items}
          value={group.id}
          getKey={(g) => g.id}
          getLabel={(g) => g.name}
          onSelect={(g) => {
            close();
            void navigate(`/standup/${g.id}`);
          }}
          onClose={close}
          label={label}
        />
      )}
    </Popover>
  );
}
