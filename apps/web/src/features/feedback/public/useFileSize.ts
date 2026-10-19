import { useTranslation } from 'react-i18next';
import { fileSize } from '../../../lib/relativeTime';

/** "1.2 MB" (`useRelativeTime().size` without the signed-in user it also reads). */
export function useFileSize() {
  const { t } = useTranslation();
  return (bytes: number) => {
    const { unit, value } = fileSize(bytes);
    return t(`drawer.size.${unit}`, { value });
  };
}
