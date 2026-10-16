import { INBOX_TABS, inboxTabSchema, type InboxTab, type Notification } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnarchiveNotification,
} from '../../api/notifications';
import { useStandupGroups } from '../../api/standups';
import { useCurrentWorkspace, useSidebar } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import {
  BellIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  FolderIcon,
  InboxIcon,
} from '../../components/icons';
import { Menu } from '../../components/ui/Menu';
import { ProjectDot } from '../../components/ui/ProjectDot';
import { Skeleton } from '../../components/ui/Skeleton';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { Tooltip } from '../../components/ui/Tooltip';
import { UnderlineTabs } from '../../components/ui/UnderlineTabs';
import { cn } from '../../lib/cn';
import { toast } from '../../stores/toast';
import { useOpenTask } from '../create/useOpenTask';
import { writeHref } from '../standup/day/links';
import { waitingForMe } from '../standup/useStandup';
import { PageHeader } from '../views/PageHeader';
import { InboxEmpty } from './InboxEmpty';
import { NotificationRow } from './NotificationRow';
import { standupHref } from './standupLine';

/** Inbox (EmptyInbox.dc.html): header, All / Mentions / Assigned to me / Archived, the rows. */
export function InboxView() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [params, setParams] = useSearchParams();
  const tab = inboxTabSchema.catch('all').parse(params.get('tab') ?? 'all');
  const workspaceId = workspace?.id ?? '';
  const sidebar = useSidebar(workspace?.id);
  const projects = (sidebar.data?.spaces ?? []).flatMap((s) => s.projects);
  // `?project=` narrows the inbox to one project (not designed); unknown ids are ignored.
  const projectParam = params.get('project');
  const project = projects.find((p) => p.id === projectParam);
  const query = useNotifications(workspace?.id, tab, project?.id);
  const withProject = (path: string) =>
    project ? `${path}${path.includes('?') ? '&' : '?'}project=${project.id}` : path;
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
            <Menu
              label={t('inbox.projectFilter')}
              placement="bottom-end"
              width={240}
              items={[
                {
                  id: 'all',
                  label: t('inbox.allProjects'),
                  checked: !project,
                  onSelect: () => {
                    setParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.delete('project');
                        return next;
                      },
                      { replace: true },
                    );
                  },
                },
                { type: 'separator', id: 'sep' },
                ...projects.map((p) => ({
                  id: p.id,
                  label: p.name,
                  icon: <ProjectDot color={p.color} size={8} />,
                  checked: p.id === project?.id,
                  onSelect: () => {
                    setParams(
                      (prev) => {
                        const next = new URLSearchParams(prev);
                        next.set('project', p.id);
                        return next;
                      },
                      { replace: true },
                    );
                  },
                })),
              ]}
              trigger={(props) => (
                <ToolbarButton {...props} icon={<FolderIcon size={14} />}>
                  {project ? project.name : t('inbox.allProjects')}
                  <ChevronDownIcon size={12} className="text-icon" />
                </ToolbarButton>
              )}
            />
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
              to: withProject(value === 'all' ? '/inbox' : `/inbox?tab=${value}`),
            }))}
          />
        }
      />
      {tab === 'all' && <StandupWaiting workspaceId={workspaceId} />}
      {query.isError ? (
        <ErrorState error={query.error} />
      ) : !query.data ? (
        <InboxSkeleton />
      ) : (
        <InboxList
          key={`${workspaceId}:${tab}:${project?.id ?? ''}`}
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
  const navigate = useNavigate();
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
              if (n.task) openTask(n.task.key);
              else {
                const href = standupHref(n);
                if (href) void navigate(href);
              }
            }}
            onMarkRead={() => {
              markRead.mutate(n);
            }}
            onArchive={() => {
              archive.mutate(n, {
                onSuccess: () => {
                  toast({
                    message: n.task
                      ? t('inbox.archived', { key: n.task.key })
                      : t('inbox.archivedStandup'),
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

/**
 * Today's standups still waiting for my update, pinned above the notifications: the 09:30
 * reminder sinks below a day of task notifications in a busy workspace.
 */
function StandupWaiting({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const groups = useStandupGroups(workspaceId || undefined);
  const waiting = waitingForMe(groups.data);
  if (waiting.length === 0) return null;
  return (
    <ul aria-label={t('shell.notPostedToday')} className="m-0 list-none border-b border-subtle p-0">
      {waiting.map((g) => (
        <li key={g.id} className="flex items-center gap-3 bg-accent-soft px-6 py-2.5 max-sm:px-4">
          <span aria-hidden className="size-2 flex-none rounded-full bg-accent" />
          <span className="min-w-0 flex-1 text-[13px] font-medium break-words text-default">
            {t('inbox.standupWaiting', { group: g.name })}
          </span>
          <Link
            to={writeHref(g.id)}
            className="flex h-8 flex-none items-center rounded-[8px] bg-accent px-3 text-[13px] font-semibold text-white no-underline hover:brightness-110"
          >
            {t('standup.day.writeUpdate')}
          </Link>
        </li>
      ))}
    </ul>
  );
}
