import type { PaletteKey } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ChevronRightIcon } from '../../components/icons';
import { SpaceBadge } from '../../components/ui/SpaceBadge';

interface BreadcrumbProps {
  space: { id: string; name: string; initial: string; color: PaletteKey };
  /** Current page name (600). */
  current: string;
}

/** "[P] Product › App Redesign": 14px, 18px space badge, faint chevron, current page 600. */
export function Breadcrumb({ space, current }: BreadcrumbProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('header.breadcrumb')}
      className="flex min-w-0 items-center gap-1.5 text-[14px]"
    >
      <Link
        to={`/s/${space.id}/list`}
        className="flex min-w-0 items-center gap-1.5 text-3 hover:text-default"
      >
        <SpaceBadge initial={space.initial} color={space.color} />
        <span className="truncate">{space.name}</span>
      </Link>
      <ChevronRightIcon size={14} strokeWidth={2} className="flex-none text-faint" />
      <span aria-current="page" className="truncate font-semibold">
        {current}
      </span>
    </nav>
  );
}
