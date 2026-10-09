import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { BoardIcon, CalendarIcon, ListIcon } from '../../components/icons';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { VIEWS, type View } from './views';

/** List / Board / Calendar tabs; switching keeps the query string (filters are shared). */
export function ViewTabs({ basePath, value }: { basePath: string; value: View }) {
  const { t } = useTranslation();
  const { search } = useLocation();
  const icons = {
    list: <ListIcon size={15} />,
    board: <BoardIcon size={15} />,
    calendar: <CalendarIcon size={15} />,
  };
  return (
    <UnderlineTabs
      label={t('views.view')}
      value={value}
      items={VIEWS.map((view) => ({
        value: view,
        label: t(`views.${view}`),
        icon: icons[view],
        to: `${basePath}/${view}${search}`,
      }))}
    />
  );
}
