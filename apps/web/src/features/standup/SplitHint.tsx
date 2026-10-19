import { STANDUP_SPLIT_THRESHOLD } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { InfoIcon } from '../../components/icons';

/**
 * Above ~12 people a standup stops being a standup: one person's update scrolls past everyone
 * else's, and the meeting runs long. Shown to the people who manage the group.
 */
export function SplitHint({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= STANDUP_SPLIT_THRESHOLD) return null;
  return (
    <p
      role="note"
      className="m-0 flex items-start gap-2 rounded-[10px] border border-warm-card bg-warm-card px-3 py-2.5 text-[13px] leading-5 text-warm-card"
    >
      <span aria-hidden className="mt-0.5 flex-none">
        <InfoIcon size={14} />
      </span>
      <span>{t('standup.splitHint', { count, max: STANDUP_SPLIT_THRESHOLD })}</span>
    </p>
  );
}
