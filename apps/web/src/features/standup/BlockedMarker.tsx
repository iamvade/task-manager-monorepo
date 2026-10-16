import type { TaskBlocked } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { BanIcon } from '../../components/icons';
import { Tooltip } from '../../components/ui/Tooltip';
import { blockedHref, useBlockedText } from './blockedText';

/**
 * List row pill (Main.dc.html): 20px danger-soft, ban icon + "Blocked", linking to that standup
 * day. Hidden on done tasks.
 */
export function BlockedPill({ blocked }: { blocked: TaskBlocked }) {
  const { t } = useTranslation();
  const text = useBlockedText()(blocked);
  return (
    <Tooltip content={text.title}>
      {(props) => (
        <Link
          {...props}
          to={blockedHref(blocked)}
          aria-label={`${t('task.blocked.label')}: ${text.title}`}
          className="inline-flex h-5 flex-none items-center gap-1 rounded-[10px] bg-danger-soft px-[7px] text-[12px] font-semibold text-danger-soft no-underline hover:brightness-95"
        >
          <BanIcon size={12} strokeWidth={2.5} />
          {t('task.blocked.label')}
        </Link>
      )}
    </Tooltip>
  );
}

/**
 * Board card row (Board.dc.html): "**Blocked** · waiting on final tab icons". The card is the
 * link, so this is plain text with the source as its title.
 */
export function BlockedRow({ blocked }: { blocked: TaskBlocked }) {
  const { t } = useTranslation();
  const text = useBlockedText()(blocked);
  return (
    <span
      title={text.source}
      className="flex items-start gap-1.5 rounded-[6px] bg-danger-soft px-2 py-1.5 text-[12px] leading-4 font-medium text-danger-soft"
    >
      <BanIcon size={12} strokeWidth={2.5} className="mt-0.5 flex-none" />
      <span className="min-w-0">
        <strong className="font-semibold">{t('task.blocked.label')}</strong> · {text.detail}
        <span className="sr-only"> ({text.source})</span>
      </span>
    </span>
  );
}

/** Drawer "Blocked" line: the pill-styled text and a link to the standup day. */
export function BlockedValue({ blocked }: { blocked: TaskBlocked }) {
  const text = useBlockedText()(blocked);
  return (
    <span className="flex min-w-0 flex-col gap-0.5 py-1.5">
      {blocked.text && (
        <span className="self-start rounded-[6px] bg-danger-soft px-2 py-0.5 text-[13px] font-medium text-danger-soft">
          {blocked.text}
        </span>
      )}
      <Link
        to={blockedHref(blocked)}
        className="self-start text-[12px] text-accent-ink no-underline hover:underline"
      >
        {text.source}
      </Link>
    </span>
  );
}
