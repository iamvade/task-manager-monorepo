import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRealtimeStore } from '../../stores/realtime';

/** A drop shorter than this (a deploy, a network blip) shows nothing. */
export const PILL_DELAY_MS = 2000;

/**
 * Not designed: a small "Reconnecting…" pill at the top center of the page while the realtime
 * connection is down (surface pill, popover shadow, 12px muted text).
 */
export function ConnectionPill() {
  const { t } = useTranslation();
  const down = useRealtimeStore((s) => s.status !== 'open');
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!down) return;
    const timer = window.setTimeout(() => {
      setShown(true);
    }, PILL_DELAY_MS);
    // Back online: hide, and wait the full delay again next time.
    return () => {
      window.clearTimeout(timer);
      setShown(false);
    };
  }, [down]);

  return (
    <div role="status" aria-live="polite" className="contents">
      {shown && (
        <div className="pointer-events-none absolute top-2 left-1/2 z-[70] flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-default bg-surface px-3 text-[12px] whitespace-nowrap text-muted shadow-popover">
          <Loader2 size={12} aria-hidden className="animate-spin motion-reduce:animate-none" />
          {t('shell.reconnecting')}
        </div>
      )}
    </div>
  );
}
