import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

/** Settings (phase 15). */
export function SettingsPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('shell.settings')} />;
}
