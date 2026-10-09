import { ACCENTS, type Accent, type Density, type Locale, type Theme } from '@kite/shared';
import { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveMe } from '../../api/useSaveMe';
import { useAuth } from '../../auth/useAuth';
import { CheckIcon, ChevronDownIcon } from '../../components/icons';
import { useLanguage } from '../../components/useLanguage';
import { Picker } from '../../components/ui/Picker';
import { Popover } from '../../components/ui/Popover';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { cn } from '../../lib/cn';
import { SettingsRow, SettingsSection } from './SettingsRow';

const ACCENT_NAMES: Record<Accent, 'violet' | 'blue' | 'teal' | 'graphite'> = {
  '#6E56CF': 'violet',
  '#2F6FEB': 'blue',
  '#0F766E': 'teal',
  '#3F3F46': 'graphite',
};

export function PreferencesSection() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const save = useSaveMe();
  const language = useLanguage();
  const ids = { language: useId(), theme: useId(), accent: useId(), density: useId() };
  if (!me) return null;
  const prefs = me.preferences;

  return (
    <SettingsSection title={t('settings.tabs.preferences')}>
      <SettingsRow
        label={t('shell.language')}
        hint={t('settings.preferences.languageHint')}
        labelId={ids.language}
      >
        <SegmentedControl<Locale>
          labelledBy={ids.language}
          size="md"
          value={language.current}
          onChange={language.change}
          options={[
            { value: 'mn', label: 'Монгол', lang: 'mn' },
            { value: 'en', label: 'English', lang: 'en' },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        label={t('settings.preferences.timezone')}
        hint={t('settings.preferences.timezoneHint')}
      >
        <TimezonePicker
          value={prefs.timezone}
          onChange={(timezone) => {
            save({ timezone });
          }}
        />
      </SettingsRow>
      <SettingsRow
        label={t('shell.theme')}
        hint={t('settings.preferences.themeHint')}
        labelId={ids.theme}
      >
        <SegmentedControl<Theme>
          labelledBy={ids.theme}
          size="md"
          value={prefs.theme}
          onChange={(theme) => {
            save({ theme });
          }}
          options={[
            { value: 'light', label: t('shell.themeLight') },
            { value: 'dark', label: t('shell.themeDark') },
            { value: 'system', label: t('shell.themeSystem') },
          ]}
        />
      </SettingsRow>
      <SettingsRow
        label={t('settings.preferences.accent')}
        hint={t('settings.preferences.accentHint')}
        labelId={ids.accent}
      >
        <AccentSwatches
          labelledBy={ids.accent}
          value={prefs.accent}
          onChange={(accent) => {
            save({ accent });
          }}
        />
      </SettingsRow>
      <SettingsRow
        label={t('settings.preferences.density')}
        hint={t('settings.preferences.densityHint')}
        labelId={ids.density}
      >
        <SegmentedControl<Density>
          labelledBy={ids.density}
          size="md"
          value={prefs.density}
          onChange={(density) => {
            save({ density });
          }}
          options={[
            { value: 'comfortable', label: t('settings.preferences.comfortable') },
            { value: 'compact', label: t('settings.preferences.compact') },
          ]}
        />
      </SettingsRow>
    </SettingsSection>
  );
}

/** The 4 accents of the designs as 24px swatches; the chosen one carries a ✓. */
function AccentSwatches({
  labelledBy,
  value,
  onChange,
}: {
  labelledBy: string;
  value: Accent;
  onChange: (accent: Accent) => void;
}) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex gap-2">
      {ACCENTS.map((accent, i) => {
        const selected = accent === value;
        const name = t(`settings.accents.${ACCENT_NAMES[accent]}`);
        return (
          <button
            key={accent}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={name}
            title={name}
            tabIndex={selected ? 0 : -1}
            onClick={() => {
              onChange(accent);
            }}
            onKeyDown={(e) => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              const next = (i + step + ACCENTS.length) % ACCENTS.length;
              const nextAccent = ACCENTS[next];
              if (nextAccent) onChange(nextAccent);
              e.currentTarget.parentElement?.querySelectorAll('button')[next]?.focus();
            }}
            style={{ background: accent }}
            className={cn(
              'flex size-6 items-center justify-center rounded-full border-0 p-0 text-white',
              selected && 'shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--border-strong)]',
            )}
          >
            {selected && <CheckIcon size={14} strokeWidth={2.75} />}
          </button>
        );
      })}
    </div>
  );
}

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
function TimezonePicker({ value, onChange }: { value: string; onChange: (tz: string) => void }) {
  const { t } = useTranslation();
  const zones = useMemo(() => zoneList(), []);
  const current = zones.find((z) => z.id === value);
  const label = t('settings.preferences.timezone');
  return (
    <Popover
      label={label}
      width={300}
      elevation="lg"
      placement="bottom-end"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`${label}: ${value}`}
          className="inline-flex h-8 max-w-[260px] min-w-0 items-center gap-2 rounded-[8px] border border-control bg-control px-3 text-[13px] text-default hover:bg-hover"
        >
          <span className="truncate">{value.replaceAll('_', ' ')}</span>
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
