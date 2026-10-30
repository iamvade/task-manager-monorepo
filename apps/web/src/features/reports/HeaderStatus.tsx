import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SpinnerIcon } from '../../components/icons';
import { useRelativeTime } from '../../lib/useRelativeTime';

const TICK_MS = 30_000;

/** "Updated 5 minutes ago" (12px muted) from the report's `generatedAt`, re-rendered every 30 s. */
export function UpdatedStatus({ generatedAt }: { generatedAt: string }) {
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
  const text = t('reports.updated', { ago: ago(generatedAt, { inline: true, now }) });
  return (
    <span className="text-[12px] text-muted">
      {text.charAt(0).toLocaleUpperCase() + text.slice(1)}
    </span>
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
