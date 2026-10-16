import { ACCENTS, type Accent, type Density, type Locale, type Theme } from '@kite/shared';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useSaveMe } from '../../api/useSaveMe';
import { useAuth } from '../../auth/useAuth';
import { CheckIcon } from '../../components/icons';
import { useLanguage } from '../../components/useLanguage';
import { TimezonePicker } from '../../components/TimezonePicker';
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
