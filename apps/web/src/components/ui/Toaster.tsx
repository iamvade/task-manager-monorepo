import { FloatingPortal } from '@floating-ui/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/cn';
import { useToastStore, type Toast } from '../../stores/toast';
import { CloseIcon } from '../icons';

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      dismiss(toast.id);
    }, toast.duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex min-h-10 max-w-[480px] items-center gap-3 rounded-[10px] bg-tooltip py-2 pr-2 pl-4 text-[13px] text-tooltip shadow-popover',
        toast.tone === 'danger' && 'border-l-4 border-l-[var(--danger)]',
      )}
    >
      <span className="min-w-0 flex-1">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
          className="h-7 flex-none rounded-[6px] border-0 bg-transparent px-2 text-[13px] font-medium text-[color:var(--accent-ink-dark)] hover:bg-white/10"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label={t('common.close')}
        onClick={() => {
          dismiss(toast.id);
        }}
        className="flex size-7 flex-none items-center justify-center rounded-[6px] border-0 bg-transparent text-tooltip opacity-70 hover:bg-white/10 hover:opacity-100"
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

/**
 * Toast stack, bottom center (not designed; derived from the tooltip: inverted surface, radius
 * 10, 13px, `--shadow-popover`, action in accent-ink). `data-overlay-keep`: clicking a toast
 * doesn't dismiss the drawer underneath.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <FloatingPortal>
      <div
        role="status"
        aria-live="polite"
        data-overlay-keep=""
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <ToastItem key={item.id} toast={item} />
        ))}
      </div>
    </FloatingPortal>
  );
}
