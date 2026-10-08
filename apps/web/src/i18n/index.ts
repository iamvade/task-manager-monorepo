import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getStoredLanguage } from '../preferences';
import en from './locales/en.json';
import mn from './locales/mn.json';

export const defaultNS = 'translation';
export const resources = {
  mn: { translation: mn },
  en: { translation: en },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  // Mongolian unless this browser picked English on the sign-in page; after sign-in the
  // user's saved locale takes over (AuthProvider).
  lng: getStoredLanguage() ?? 'mn',
  fallbackLng: 'en',
  supportedLngs: ['mn', 'en'],
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
