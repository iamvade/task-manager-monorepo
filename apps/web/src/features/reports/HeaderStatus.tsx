import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CycleIcon, SpinnerIcon } from '../../components/icons';
import { useRelativeTime } from '../../lib/useRelativeTime';

const TICK_MS = 30_000;

/**
 * "Updated 5 minutes ago" (12px muted) from the report's `generatedAt`, re-rendered every 30 s.
 * It is also the refresh button: the cycle icon spins while the report refetches.
 */
export function UpdatedStatus({
  generatedAt,
  onRefresh,
  isFetching = false,
}: {
  generatedAt: string;
  onRefresh: () => void;
  isFetching?: boolean;
}) {
  const { t } = useTranslation();
  const { ago } = useRelativeTime();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, TICK_MS);
    return () => {
      clearInterval(id);
    };
  }, []);
  const when = ago(generatedAt, { inline: true, now });
  const text = t('reports.updated', { ago: when });
  return (
    <button
      type="button"
      aria-label={t('reports.refresh', { ago: when })}
      aria-busy={isFetching || undefined}
      onClick={onRefresh}
      className="flex h-7 items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[12px] text-muted hover:bg-hover hover:text-2"
    >
      <CycleIcon
        size={12}
        className={isFetching ? 'animate-spin motion-reduce:animate-none' : undefined}
      />
      {text.charAt(0).toLocaleUpperCase() + text.slice(1)}
    </button>
  );
}

/** Spinning accent arc + "Loading reports…" (ReportsLoading.dc.html). */
export function LoadingStatus() {
  const { t } = useTranslation();
  return (
    <span role="status" className="flex items-center gap-2 text-[12px] text-muted">
      <SpinnerIcon size={14} className="animate-spin text-accent-ink motion-reduce:animate-none" />
      {t('reports.loading')}
    </span>
  );
}
