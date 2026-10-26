import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { RECENT_DONE_DAYS } from './useTaskQuery';
import { ALL_DONE, useViewParams } from './useViewParams';

/**
 * "Done in the last 14 days · Show all" under the List and in the Board's Done column
 * ("Cancelled in …" in the Cancelled column: the same window).
 */
export function DoneScopeNote({
  className,
  cancelled = false,
}: {
  className?: string;
  cancelled?: boolean;
}) {
  const { t } = useTranslation();
  const { allDone, update } = useViewParams();
  return (
    <p
      className={cn('m-0 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted', className)}
    >
      <span>
        {cancelled
          ? allDone
            ? t('views.cancelledAll')
            : t('views.cancelledRecent', { count: RECENT_DONE_DAYS })
          : allDone
            ? t('views.doneAll')
            : t('views.doneRecent', { count: RECENT_DONE_DAYS })}
      </span>
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={() => {
          update({ done: allDone ? null : ALL_DONE }, true);
        }}
        className="rounded-[6px] border-0 bg-transparent p-0 text-[12px] font-medium text-accent-ink hover:underline"
      >
        {allDone ? t('views.doneRecentOnly') : t('views.doneShowAll')}
      </button>
    </p>
  );
}
