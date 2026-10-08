import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import mn from './locales/mn.json';

export const defaultNS = 'translation';
export const resources = {
  mn: { translation: mn },
  en: { translation: en },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'mn',
  fallbackLng: 'en',
  supportedLngs: ['mn', 'en'],
  interpolation: { escapeValue: false },
});

export default i18n;
