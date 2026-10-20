import type { ActivityFeedItem } from '@kite/shared';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWsPath } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { Avatar } from '../../components/ui/Avatar';
import { useDates } from '../../lib/useDates';
import { feedLine } from './feedLine';
import { useFeedTime } from './useFeedTime';

function FeedItem({ item }: { item: ActivityFeedItem }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const time = useFeedTime();
  const line = feedLine(item, { t, formatDate: dates.formatDate, meId: me?.user.id });

  return (
    <li className="flex gap-2.5 px-4 py-2.5 hover:bg-subtle">
      <Avatar user={item.activity.actor} size={24} title={null} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="m-0 text-[13px] leading-[18px] text-2">
          <Trans
            i18nKey={`myTasks.feed.${line.key}`}
            values={line.values}
            components={{
              b: <strong className="font-semibold text-default" />,
              task: (
                <Link
                  to={{ search: `?task=${item.task.key}` }}
                  className="font-medium text-default no-underline hover:underline"
                />
              ),
            }}
          />
        </p>
        {item.snippet && (
          <p className="m-0 mt-0.5 truncate rounded-[6px] bg-sidebar px-2 py-1.5 text-[12px] leading-[18px] text-2">
            “{item.snippet}”
          </p>
        )}
        <span className="text-[12px] text-muted">
          {t('myTasks.feed.meta', {
            time: time(item.activity.createdAt),
            project: item.project.name,
          })}
        </span>
      </div>
      {item.unread && (
        <span
          role="img"
          aria-label={t('myTasks.feed.unread')}
          className="mt-1.5 size-2 flex-none rounded-full bg-accent"
        />
      )}
    </li>
  );
}

interface ActivityPanelProps {
  items: ActivityFeedItem[];
  /** "Show older activity" (hidden when there is nothing older). */
  onShowOlder?: () => void;
  loadingOlder: boolean;
}

/** "Recent activity" panel: header with View inbox, the feed, "Show older activity". */
export function ActivityPanel({ items, onShowOlder, loadingOlder }: ActivityPanelProps) {
  const { t } = useTranslation();
  const ws = useWsPath();
  return (
    <aside
      aria-labelledby="recent-activity"
      className="flex min-w-0 flex-col overflow-hidden rounded-[12px] border border-default"
    >
      <div className="flex h-12 items-center justify-between gap-3 border-b border-subtle px-4">
        <h2 id="recent-activity" className="m-0 truncate text-[14px] leading-5 font-semibold">
          {t('myTasks.recentActivity')}
        </h2>
        <Link
          to={ws('/inbox')}
          className="flex-none text-[12px] font-medium whitespace-nowrap text-accent-ink no-underline"
        >
          {t('myTasks.viewInbox')}
        </Link>
      </div>
      {items.length > 0 ? (
        <ol className="m-0 flex list-none flex-col py-1 pl-0">
          {items.map((item) => (
            <FeedItem key={item.activity.id} item={item} />
          ))}
        </ol>
      ) : (
        <p className="m-0 px-4 py-6 text-center text-[13px] text-muted">
          {t('myTasks.feed.empty')}
        </p>
      )}
      {onShowOlder && (
        <button
          type="button"
          onClick={onShowOlder}
          disabled={loadingOlder}
          aria-busy={loadingOlder || undefined}
          className="flex h-10 items-center justify-center border-x-0 border-t border-b-0 border-subtle bg-transparent text-[13px] text-3 hover:text-default"
        >
          {t('myTasks.showOlder')}
        </button>
      )}
    </aside>
  );
}
