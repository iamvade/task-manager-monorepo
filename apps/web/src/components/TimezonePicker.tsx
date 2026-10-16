import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';
import { ChevronDownIcon } from './icons';
import { Picker } from './ui/Picker';
import { Popover } from './ui/Popover';

interface Zone {
  id: string;
  /** "GMT+8". */
  offset: string;
}

function zoneList(): Zone[] {
  const now = new Date();
  return Intl.supportedValuesOf('timeZone').map((id) => {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: id, timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName');
    return { id, offset: part?.value ?? '' };
  });
}

/** Searchable IANA time zone picker ("Asia/Ulaanbaatar · GMT+8"). */
export function TimezonePicker({
  value,
  onChange,
  label: labelOverride,
  id,
  className,
  disabled,
}: {
  value: string;
  onChange: (tz: string) => void;
  /** Accessible name; defaults to "Time zone". */
  label?: string;
  id?: string;
  /** Trigger classes (size), merged over the 32px Settings control. */
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const zones = useMemo(() => zoneList(), []);
  const current = zones.find((z) => z.id === value);
  const label = labelOverride ?? t('settings.preferences.timezone');
  return (
    <Popover
      label={label}
      width={300}
      elevation="lg"
      placement="bottom-end"
      trigger={(props) => (
        <button
          {...props}
          id={id}
          type="button"
          disabled={disabled}
          aria-label={`${label}: ${value}`}
          className={cn(
            'inline-flex h-8 max-w-[260px] min-w-0 items-center gap-2 rounded-[8px] border border-control bg-control px-3 text-[13px] text-default enabled:hover:bg-hover disabled:opacity-60',
            className,
          )}
        >
          <span className="flex-1 truncate text-left">{value.replaceAll('_', ' ')}</span>
          {current && <span className="flex-none text-muted">{current.offset}</span>}
          <ChevronDownIcon size={12} className="flex-none text-icon" />
        </button>
      )}
    >
      {(close) => (
        <Picker<Zone>
          items={zones}
          value={value}
          getKey={(z) => z.id}
          getLabel={(z) => `${z.id.replaceAll('_', ' ')} ${z.offset}`}
          renderItem={(z) => (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">{z.id.replaceAll('_', ' ')}</span>
              <span className="flex-none text-[12px] text-muted">{z.offset}</span>
            </span>
          )}
          onSelect={(z) => {
            onChange(z.id);
            close();
          }}
          onClose={close}
          search={{ placeholder: t('settings.preferences.timezoneSearch') }}
          emptyText={t('common.noResults')}
          label={label}
        />
      )}
    </Popover>
  );
}
