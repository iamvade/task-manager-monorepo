import type { Notification } from '@kite/shared';
import { Trans, useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { ArchiveIcon, CheckCheckIcon, UnarchiveIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { IconButton } from '../../components/ui/IconButton';
import { Tooltip } from '../../components/ui/Tooltip';
import { useDates } from '../../lib/useDates';
import { useFeedTime } from '../my-tasks/useFeedTime';
import { inboxLine } from './inboxLine';

interface NotificationRowProps {
  notification: Notification;
  onOpen: () => void;
  onMarkRead: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}

/**
 * One inbox row, styled like the My Tasks feed (MyTasks.dc.html): avatar, "Sara K. mentioned
 * you in APP-142 Title", quoted snippet, "2h ago · Project", unread dot. Hover or focus shows
 * Mark as read / Archive (Move to inbox on archived rows).
 */
export function NotificationRow({
  notification: n,
  onOpen,
  onMarkRead,
  onArchive,
  onUnarchive,
}: NotificationRowProps) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const dates = useDates();
  const time = useFeedTime();
  const line = inboxLine(n, { t, formatDate: dates.formatDate, meId: me?.user.id });
  const unread = n.readAt === null && n.archivedAt === null;

  return (
    <li className="group relative flex border-b border-subtle hover:bg-subtle has-[:focus-visible]:bg-subtle">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 gap-2.5 border-0 bg-transparent py-2.5 pr-2 pl-6 text-left focus-visible:-outline-offset-2"
      >
        <Avatar user={n.actor} size={24} title={null} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-[13px] leading-[18px] text-2">
            <Trans
              i18nKey={`myTasks.feed.${line.key}`}
              values={line.values}
              components={{
                b: <strong className="font-semibold text-default" />,
                task: <TaskName title={n.task.title} />,
              }}
            />
          </span>
          {n.snippet && (
            <span className="mt-0.5 truncate rounded-[6px] bg-sidebar px-2 py-1.5 text-[12px] leading-[18px] text-2">
              “{n.snippet}”
            </span>
          )}
          <span className="truncate text-[12px] text-muted">
            {t('myTasks.feed.meta', { time: time(n.createdAt), project: n.project.name })}
          </span>
        </span>
      </button>
      <div className="flex flex-none items-start gap-1 py-2 pr-6">
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 group-has-[:focus-visible]:opacity-100">
          {unread && (
            <RowAction label={t('inbox.markRead')} onClick={onMarkRead}>
              <CheckCheckIcon size={14} />
            </RowAction>
          )}
          {n.archivedAt === null ? (
            <RowAction label={t('inbox.archive')} onClick={onArchive}>
              <ArchiveIcon size={14} />
            </RowAction>
          ) : (
            <RowAction label={t('inbox.unarchive')} onClick={onUnarchive}>
              <UnarchiveIcon size={14} />
            </RowAction>
          )}
        </div>
        <span className="flex size-7 flex-none items-center justify-center">
          {unread && (
            <span
              role="img"
              aria-label={t('myTasks.feed.unread')}
              className="size-2 rounded-full bg-accent"
            />
          )}
        </span>
      </div>
    </li>
  );
}

/** `<task>APP-142</task>` in the sentence: the key in mono, then the title. */
function TaskName({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <>
      <span className="font-mono text-[12px] text-3">{children}</span>{' '}
      <span className="font-medium text-default">{title}</span>
    </>
  );
}

function RowAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      {(props) => <IconButton {...props} label={label} icon={children} onClick={onClick} />}
    </Tooltip>
  );
}
