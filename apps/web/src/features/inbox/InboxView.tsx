import { INBOX_TABS, inboxTabSchema, type InboxTab, type Notification } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnarchiveNotification,
} from '../../api/notifications';
import { useCurrentWorkspace } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import { BellIcon, CheckCheckIcon, InboxIcon } from '../../components/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { Tooltip } from '../../components/ui/Tooltip';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toast';
import { useOpenTask } from '../create/useOpenTask';
import { PageHeader } from '../views/PageHeader';
import { InboxEmpty } from './InboxEmpty';
import { NotificationRow } from './NotificationRow';

/** Inbox (EmptyInbox.dc.html): header, All / Mentions / Assigned to me / Archived, the rows. */
export function InboxView() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [params] = useSearchParams();
  const tab = inboxTabSchema.catch('all').parse(params.get('tab') ?? 'all');
  const workspaceId = workspace?.id ?? '';
  const query = useNotifications(workspace?.id, tab);
  const markAll = useMarkAllNotificationsRead(workspaceId);
  const counts = query.data?.pages[0]?.counts;
  const unread = counts?.unread ?? 0;

  return (
    <>
      <PageHeader
        title={
          <h1 className="m-0 flex min-w-0 items-center gap-2 text-[14px] leading-5 font-semibold">
            <InboxIcon size={16} className="flex-none text-3" />
            <span className="truncate">{t('shell.inbox')}</span>
          </h1>
        }
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={unread === 0}
              onClick={() => {
                markAll.mutate(undefined);
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-[8px] border bg-control px-2.5 text-[13px] whitespace-nowrap',
                unread === 0
                  ? 'cursor-not-allowed border-subtle text-faint'
                  : 'border-control text-default hover:bg-hover',
              )}
            >
              <CheckCheckIcon size={14} />
              {t('inbox.markAllRead')}
            </button>
            <Tooltip content={t('inbox.notificationSettings')}>
              {(props) => (
                <Link
                  {...props}
                  to="/settings?tab=notifications"
                  aria-label={t('inbox.notificationSettings')}
                  className="flex size-8 items-center justify-center rounded-[8px] text-3 hover:bg-hover"
                >
                  <BellIcon size={16} />
                </Link>
              )}
            </Tooltip>
          </div>
        }
        tabs={
          <UnderlineTabs
            label={t('inbox.filter')}
            value={tab}
            items={INBOX_TABS.map((value) => ({
              value,
              label: t(`inbox.tabs.${value}`),
              to: value === 'all' ? '/inbox' : `/inbox?tab=${value}`,
            }))}
          />
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !query.data ? (
        <InboxSkeleton />
      ) : (
        <InboxList
          key={`${workspaceId}:${tab}`}
          workspaceId={workspaceId}
          tab={tab}
          items={query.data.pages.flatMap((p) => p.items)}
          archivedCount={counts?.archived ?? 0}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          onLoadMore={() => {
            void query.fetchNextPage();
          }}
        />
      )}
    </>
  );
}

interface InboxListProps {
  workspaceId: string;
  tab: InboxTab;
  items: Notification[];
  archivedCount: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

function InboxList({
  workspaceId,
  tab,
  items,
  archivedCount,
  hasMore,
  loadingMore,
  onLoadMore,
}: InboxListProps) {
  const { t } = useTranslation();
  const openTask = useOpenTask();
  const markRead = useMarkNotificationRead(workspaceId);
  const archive = useArchiveNotification(workspaceId);
  const unarchive = useUnarchiveNotification(workspaceId);

  if (items.length === 0) return <InboxEmpty tab={tab} archivedCount={archivedCount} />;

  const isUnread = (n: Notification) => n.readAt === null && n.archivedAt === null;

  return (
    <div className="flex flex-col">
      <ul aria-label={t(`inbox.tabs.${tab}`)} className="m-0 list-none pl-0">
        {items.map((n) => (
          <NotificationRow
            key={n.id}
            notification={n}
            onOpen={() => {
              if (isUnread(n)) markRead.mutate(n);
              openTask(n.task.key);
            }}
            onMarkRead={() => {
              markRead.mutate(n);
            }}
            onArchive={() => {
              archive.mutate(n, {
                onSuccess: () => {
                  toast({
                    message: t('inbox.archived', { key: n.task.key }),
                    action: {
                      label: t('common.undo'),
                      onClick: () => {
                        unarchive.mutate(n);
                      },
                    },
                  });
                },
              });
            }}
            onUnarchive={() => {
              unarchive.mutate(n);
            }}
          />
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          aria-busy={loadingMore || undefined}
          className="flex h-10 items-center justify-center border-0 bg-transparent text-[13px] text-3 hover:text-default"
        >
          {t('inbox.showOlder')}
        </button>
      )}
    </div>
  );
}

function InboxSkeleton() {
  return (
    <div className="flex flex-col" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex gap-2.5 border-b border-subtle px-6 py-3">
          <Skeleton width={24} height={24} className="rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton width="55%" height={13} />
            <Skeleton width={140} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}
