import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/ui/EmptyState';
import type { View } from './views';

/** Body of a view that a later phase builds (List 9, Board 11, Calendar 14). */
export function ViewPlaceholder({ view }: { view: View }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      title={t('views.viewTitle', { view: t(`views.${view}`) })}
      body={t('common.comingSoon')}
    />
  );
}
