import type { FeedbackListItem } from '@kite/shared';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useFeedback, useMarkFeedbackRead } from '../../../api/feedback';
import { useWsPath } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, LinkIcon } from '../../../components/icons';
import { Drawer } from '../../../components/ui/Drawer';
import { IconButton } from '../../../components/ui/IconButton';
import { Skeleton } from '../../../components/ui/Skeleton';
import { copyText } from '../../../lib/clipboard';
import { toast } from '../../../stores/toast';
import { FeedbackMain } from './FeedbackMain';
import { FeedbackSide } from './FeedbackSide';

/**
 * Feedback detail panel (FeedbackDetail.dc.html): opens over the inbox for `?item=FB-1042`.
 * ↑ / ↓ step through the current page; closing returns focus to the row's title.
 */
export function FeedbackDrawer({
  workspaceId,
  order,
}: {
  workspaceId: string;
  /** The inbox page as shown (prev / next). */
  order: readonly FeedbackListItem[];
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ws = useWsPath();
  const [params] = useSearchParams();
  const ref = params.get('item');
  const query = useFeedback(workspaceId || undefined, ref);
  const detail = query.data;
  const markRead = useMarkFeedbackRead(workspaceId);
  const marked = useRef<string | null>(null);

  // Opening an item marks it read for the team.
  useEffect(() => {
    if (!detail || detail.isRead || marked.current === detail.id) return;
    marked.current = detail.id;
    markRead.mutate({ id: detail.id, status: detail.status, isRead: detail.isRead });
  }, [detail, markRead]);

  const go = (nextRef: string | null) => {
    const next = new URLSearchParams(params);
    if (nextRef) next.set('item', nextRef);
    else next.delete('item');
    void navigate({ search: `?${next.toString()}` }, { replace: true });
  };
  const close = () => {
    const shown = ref;
    go(null);
    requestAnimationFrame(() => {
      const row = shown
        ? document.querySelector<HTMLElement>(`[data-feedback-ref="${CSS.escape(shown)}"] a`)
        : null;
      (row ?? document.getElementById('main'))?.focus();
    });
  };
  const index = order.findIndex((i) => i.ref === ref || i.id === ref);
  const prev = index > 0 ? order[index - 1] : undefined;
  const next = index >= 0 ? order[index + 1] : undefined;
  const copyLink = () => {
    if (!detail) return;
    const url = `${window.location.origin}${ws(`/feedback?item=${detail.ref}`)}`;
    copyText(url).then(
      () => {
        toast({ message: t('feedback.detail.linkCopied') });
      },
      () => {
        toast({ message: t('feedback.inbox.copyFailed'), tone: 'danger' });
      },
    );
  };

  return (
    <Drawer
      open={ref !== null}
      onClose={close}
      size="wide"
      label={t('feedback.detail.label', { ref: detail?.ref ?? ref ?? '' })}
      contentKey={ref ?? undefined}
    >
      <div className="sticky top-0 z-10 flex h-14 flex-none items-center gap-1 border-b border-default bg-surface px-4 pl-6">
        <nav aria-label={t('feedback.detail.breadcrumb')} className="flex min-w-0 flex-1">
          <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-[13px]">
            <li>
              <Link
                to={{ search: '' }}
                onClick={(e) => {
                  e.preventDefault();
                  close();
                }}
                className="text-muted hover:text-default"
              >
                {t('feedback.inbox.title')}
              </Link>
            </li>
            <li aria-hidden="true" className="text-muted">
              ›
            </li>
            <li aria-current="page" className="font-mono text-[12px] font-medium">
              {detail?.ref ?? ref}
            </li>
          </ol>
        </nav>
        <IconButton
          label={t('feedback.detail.prev')}
          icon={<ChevronUpIcon size={16} />}
          size={32}
          disabled={!prev}
          onClick={() => {
            go(prev?.ref ?? null);
          }}
        />
        <IconButton
          label={t('feedback.detail.next')}
          icon={<ChevronDownIcon size={16} />}
          size={32}
          disabled={!next}
          onClick={() => {
            go(next?.ref ?? null);
          }}
        />
        <IconButton
          label={t('feedback.detail.copyLink')}
          icon={<LinkIcon size={16} />}
          size={32}
          onClick={copyLink}
          disabled={!detail}
        />
        <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden="true" />
        <IconButton
          label={t('feedback.detail.close')}
          icon={<CloseIcon size={16} />}
          size={32}
          onClick={close}
        />
      </div>
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !detail ? (
        <div className="flex flex-col gap-4 p-7" aria-busy="true">
          <Skeleton width={160} height={20} />
          <Skeleton width="70%" height={28} />
          <Skeleton height={80} />
        </div>
      ) : (
        <div className="flex flex-1 flex-wrap items-stretch">
          <FeedbackMain workspaceId={workspaceId} detail={detail} />
          <FeedbackSide workspaceId={workspaceId} detail={detail} />
        </div>
      )}
    </Drawer>
  );
}
