import { LOCALES, type Locale } from '@kite/shared';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import mn from './locales/mn.json';

export const defaultNS = 'translation';
export const resources = {
  mn: { translation: mn },
  en: { translation: en },
} as const;

/** The first device language the app speaks, else Mongolian (the default). */
export function initialLocale(locales: readonly { languageCode: string | null }[]): Locale {
  for (const { languageCode } of locales) {
    const match = LOCALES.find((l) => l === languageCode);
    if (match) return match;
  }
  return 'mn';
}

void i18n.use(initReactI18next).init({
  resources,
  // The device language until sign-in; then the user's saved locale wins (`applyUserLocale`).
  lng: initialLocale(getLocales()),
  fallbackLng: 'en',
  supportedLngs: ['mn', 'en'],
  interpolation: { escapeValue: false },
  // Resources are bundled: initialize synchronously so the first render is translated.
  initAsync: false,
});

/** Switches to the signed-in user's language (`users.locale`). */
export function applyUserLocale(locale: Locale): void {
  if (i18n.language !== locale) void i18n.changeLanguage(locale);
}

export default i18n;
