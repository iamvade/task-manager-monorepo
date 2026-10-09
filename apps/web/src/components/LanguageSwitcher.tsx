import type { Locale } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { SegmentedControl, type SegmentOption } from './ui/SegmentedControl';
import { useLanguage } from './useLanguage';

// Language names are shown in their own language, never translated.
const LANGUAGES: readonly SegmentOption<Locale>[] = [
  { value: 'mn', label: 'МН', lang: 'mn', title: 'Монгол' },
  { value: 'en', label: 'EN', lang: 'en', title: 'English' },
];

interface LanguageSwitcherProps {
  /** segmented = МН / EN radio group; cycle = one 36×28 button that flips (sidebar rail). */
  variant?: 'segmented' | 'cycle';
  /** Segmented track: `sidebar` (#EDEDF0, Main footer) or `default` (login header). */
  track?: 'sidebar' | 'default';
  /** Id of a visible label; otherwise the group is named "Language". */
  labelledBy?: string;
}

/** МН / EN switch. Signed in, the choice is saved to the profile; otherwise to this browser. */
export function LanguageSwitcher({
  variant = 'segmented',
  track = 'default',
  labelledBy,
}: LanguageSwitcherProps) {
  const { t } = useTranslation();
  const { current, change } = useLanguage();

  if (variant === 'cycle') {
    const option = LANGUAGES.find((l) => l.value === current) ?? LANGUAGES[0];
    return (
      <button
        type="button"
        onClick={() => {
          change(current === 'mn' ? 'en' : 'mn');
        }}
        aria-label={`${t('language.label')}: ${option?.title ?? ''}`}
        className="h-7 w-9 rounded-[6px] border border-control bg-control text-[11px] font-semibold text-2 hover:bg-hover"
      >
        {option?.label}
      </button>
    );
  }

  return (
    <SegmentedControl
      options={LANGUAGES}
      value={current}
      onChange={change}
      label={labelledBy ? undefined : t('language.label')}
      labelledBy={labelledBy}
      track={track}
    />
  );
}
