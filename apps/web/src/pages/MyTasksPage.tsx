import { useTranslation } from 'react-i18next';
import { PlaceholderPage } from './PlaceholderPage';

/** My Tasks home (phase 13). */
export function MyTasksPage() {
  const { t } = useTranslation();
  return <PlaceholderPage title={t('shell.myTasks')} />;
}
