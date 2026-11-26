import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { PencilIcon } from '../../components/icons';
import type { MenuItem } from '../../components/ui/Menu';
import type { NavEntry } from './useNavEntries';

/**
 * The sidebar's and rail's "More" menu: the links not in the short list, then
 * "Customize sidebar…".
 */
export function useMoreMenu(hidden: NavEntry[], onCustomize: () => void) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const badges = hidden.filter((e) => e.badge).map((e) => e.badge);
  const items: MenuItem[] = [
    ...hidden.map((entry) => ({
      id: entry.key,
      label: entry.label,
      icon: entry.icon,
      trailing: entry.trailing,
      onSelect: () => {
        void navigate(entry.to);
      },
    })),
    ...(hidden.length > 0 ? [{ type: 'separator' as const, id: 'sep' }] : []),
    {
      id: 'customize',
      label: t('shell.customizeSidebarItem'),
      icon: <PencilIcon size={16} />,
      onSelect: onCustomize,
    },
  ];
  return {
    items,
    /** The trigger's accessible name: "More", plus what needs attention behind it. */
    label: badges.length > 0 ? `${t('shell.more')}, ${badges.join(', ')}` : t('shell.more'),
    hasBadge: badges.length > 0,
  };
}
