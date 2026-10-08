import type { Locale } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useUpdateMe } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { storeLanguage } from '../preferences';
import { SegmentedControl, type SegmentOption } from './ui/SegmentedControl';

// Language names are shown in their own language, never translated.
const LANGUAGES: readonly SegmentOption<Locale>[] = [
  { value: 'mn', label: 'МН', lang: 'mn', title: 'Монгол' },
  { value: 'en', label: 'EN', lang: 'en', title: 'English' },
];

/** МН / EN switch. Signed in, the choice is saved to the profile; otherwise to this browser. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const { me } = useAuth();
  const updateMe = useUpdateMe();
  const current: Locale = i18n.language === 'en' ? 'en' : 'mn';

  function change(locale: Locale) {
    if (locale === current) return;
    void i18n.changeLanguage(locale);
    storeLanguage(locale);
    if (me) updateMe.mutate({ locale });
  }

  return (
    <SegmentedControl
      options={LANGUAGES}
      value={current}
      onChange={change}
      label={t('language.label')}
    />
  );
}
