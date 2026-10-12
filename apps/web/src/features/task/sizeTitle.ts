import { SIZE_POINTS, type Size } from '@kite/shared';
import { useTranslation } from 'react-i18next';

/** "S = 1 point · Small · about half a day" (titles of the size buttons and menu items). */
export function useSizeTitle() {
  const { t } = useTranslation();
  return (size: Size) =>
    t('taskSize.option', {
      size,
      points: t('taskSize.points', { count: SIZE_POINTS[size] }),
      description: t(`taskSize.description.${size}`),
    });
}
