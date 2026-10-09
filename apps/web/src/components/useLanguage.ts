import type { Locale } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useUpdateMe } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { storeLanguage } from '../preferences';

/** The UI language and a setter that also saves it (profile, or this browser when signed out). */
export function useLanguage() {
  const { i18n } = useTranslation();
  const { me } = useAuth();
  const updateMe = useUpdateMe();
  const current: Locale = i18n.language === 'en' ? 'en' : 'mn';

  function change(locale: Locale) {
    if (locale === current) return;
    void i18n.changeLanguage(locale);
    storeLanguage(locale);
    if (me) updateMe.mutate({ locale });
  }
  return { current, change };
}
