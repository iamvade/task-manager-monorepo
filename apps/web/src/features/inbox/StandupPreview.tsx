import { shortName, type Notification, type UserRef } from '@kite/shared';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useWsPath } from '../../api/workspaces';
import { CloseIcon, StandupIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { IconButton } from '../../components/ui/IconButton';
import { useDates } from '../../lib/useDates';
import { useFeedTime } from '../my-tasks/useFeedTime';
import { standupHref, standupLine } from './standupLine';

interface StandupPreviewProps {
  notification: Notification;
  onClose: () => void;
}

/**
 * The inbox side pane for a standup notification (not designed): the group and day, the inbox
 * sentence, the reply or blocker it's about (or the digest's lists) and a way into the group
 * page. Standup content stays on the group page; this only previews what the notification
 * already carries.
 */
export function StandupPreview({ notification: n, onClose }: StandupPreviewProps) {
  const { t } = useTranslation();
  const ws = useWsPath();
  const dates = useDates();
  const time = useFeedTime();
  const line = standupLine(n);
  const href = standupHref(n);
  if (!n.standup || !line) return null;
  const reminder = n.type === 'standup_reminder';
  const digest = n.type === 'standup_digest' ? n.digest : null;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-[3] box-border flex h-14 flex-none items-center gap-2 border-b border-default bg-surface pr-4 pl-6">
        <StandupIcon size={16} className="flex-none text-3" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-3">
          <span className="font-medium text-default">{n.standup.groupName}</span>
          {' · '}
          {dates.formatDate(n.standup.date)}
        </span>
        <IconButton
          label={t('drawer.close')}
          title={t('drawer.close')}
          size={32}
          onClick={onClose}
          icon={<CloseIcon size={16} />}
        />
      </div>
      <div className="flex flex-col gap-5 px-6 pt-6 pb-8">
        <div className="flex gap-3">
          {n.actor ? (
            <Avatar user={n.actor} size={32} textSize={13} title={null} />
          ) : (
            <span
              aria-hidden="true"
              className="flex size-8 flex-none items-center justify-center rounded-full bg-accent-soft text-accent-ink"
            >
              <StandupIcon size={16} />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="m-0 text-[14px] leading-5 text-2">
              <Trans
                i18nKey={`inbox.standup.${line.key}`}
                values={line.values}
                components={{ b: <strong className="font-semibold text-default" /> }}
              />
            </p>
            <span className="text-[12px] text-muted">{time(n.createdAt)}</span>
          </div>
        </div>

        {n.snippet && (
          <figure className="m-0 flex flex-col gap-1.5">
            <figcaption className="text-[12px] text-muted">
              {/* help / resolved carry the blocker; replies and mentions the reply. */}
              {n.type === 'standup_help' || n.type === 'standup_resolved'
                ? t('inbox.preview.blocker')
                : t('inbox.preview.reply')}
            </figcaption>
            <blockquote className="m-0 rounded-[10px] bg-sidebar px-3 py-2.5 text-[14px] leading-[22px] break-words whitespace-pre-wrap text-body">
              {n.snippet}
            </blockquote>
          </figure>
        )}

        {digest && (
          <div className="flex flex-col gap-4">
            <People label={t('inbox.preview.posted')} users={digest.posted} />
            <People label={t('inbox.preview.notPosted')} users={digest.notPosted} />
            <People label={t('inbox.preview.out')} users={digest.out} />
            <p className="m-0 text-[13px] text-2">
              {t('inbox.standup.openBlockers', { count: digest.openBlockers })}
            </p>
          </div>
        )}

        {href && (
          <div>
            <Link
              to={ws(href)}
              className="inline-flex h-8 items-center rounded-[8px] bg-accent px-3 text-[13px] font-semibold text-white no-underline hover:brightness-110"
            >
              {reminder ? t('standup.day.writeUpdate') : t('inbox.openStandup')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function People({ label, users }: { label: string; users: readonly UserRef[] }) {
  if (users.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-medium text-muted">
        {label} · {users.length}
      </h3>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-1.5 text-[13px] text-default">
            <Avatar user={u} size={20} title={null} />
            {shortName(u.name)}
          </li>
        ))}
      </ul>
    </section>
  );
}
