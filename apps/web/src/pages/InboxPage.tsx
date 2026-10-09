import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

/** Inbox (phase 15). */
export function InboxPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('shell.inbox')} />;
}
