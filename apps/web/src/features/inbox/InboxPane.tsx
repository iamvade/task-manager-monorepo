import type { Notification } from '@kite/shared';
import { Suspense, lazy } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { InboxIcon } from '../../components/icons';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { loadTaskDetailView } from '../task/loadTaskDetailView';
import { StandupPreview } from './StandupPreview';

const TaskDetailView = lazy(() =>
  loadTaskDetailView().then((m) => ({ default: m.TaskDetailView })),
);

interface InboxPaneProps {
  /** The selected notification; null shows the placeholder. */
  notification: Notification | null;
  onClose: () => void;
}

/**
 * Right side of the split inbox (not designed; Linear-style): the selected notification's
 * task (the same detail as the drawer, `layout="pane"`), a standup preview, or a placeholder.
 */
export function InboxPane({ notification: n, onClose }: InboxPaneProps) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t('inbox.pane')}
      data-inbox-pane=""
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-auto bg-surface"
    >
      {n?.task ? (
        <ErrorBoundary>
          <Suspense fallback={null}>
            <TaskDetailView key={n.task.key} taskKey={n.task.key} layout="pane" onClose={onClose} />
          </Suspense>
        </ErrorBoundary>
      ) : n?.standup ? (
        <StandupPreview key={n.id} notification={n} onClose={onClose} />
      ) : (
        <Placeholder />
      )}
    </section>
  );
}

function Placeholder() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-subtle text-icon"
      >
        <InboxIcon size={22} />
      </span>
      <p className="m-0 text-[14px] font-medium text-default">{t('inbox.noneSelected')}</p>
      <p className="m-0 max-w-[400px] text-[13px] leading-[24px] text-muted">
        <Trans
          i18nKey="inbox.noneSelectedHint"
          components={{
            kbd: (
              <kbd className="mx-0.5 inline-block rounded-[4px] border border-b-2 border-control bg-control px-1.5 font-sans text-[11px] leading-[18px] text-2" />
            ),
          }}
        />
      </p>
    </div>
  );
}
