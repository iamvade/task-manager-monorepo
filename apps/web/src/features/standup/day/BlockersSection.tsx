import { shortName, type StandupBlocker } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolveBlocker } from '../../../api/standups';
import { BanIcon, ChevronDownIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { cn } from '../../../lib/cn';
import { useDates } from '../../../lib/useDates';
import { useDayView } from './DayContext';
import { ReplyField, ReplyThread } from './Replies';
import { TaskChip } from './TaskChip';

/**
 * Blockers (Standup.dc.html, when "Show blockers first" is on): open ones first, earlier days'
 * open ones included ("since Oct 8"). The checkbox resolves on the group's today only.
 */
export function BlockersSection() {
  const { t } = useTranslation();
  const { day } = useDayView();
  const open = day.blockers.filter((b) => !b.resolvedAt).length;
  if (day.blockers.length === 0) return null;
  return (
    <section aria-labelledby="standup-blockers" className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <BanIcon size={16} strokeWidth={2.25} className="text-danger-soft" />
        <h2 id="standup-blockers" className="m-0 text-[15px] font-semibold">
          {t('standup.day.blockers')}
        </h2>
        <span
          aria-label={t('standup.day.openBlockers', { count: open })}
          className="box-border flex h-5 min-w-5 items-center justify-center rounded-[10px] bg-danger-soft px-1.5 text-[12px] font-semibold text-danger-soft"
        >
          {open}
        </span>
      </div>
      <ul className="m-0 flex list-none flex-col overflow-hidden rounded-[12px] border border-danger-card p-0">
        {day.blockers.map((b) => (
          <BlockerRow key={b.id} blocker={b} />
        ))}
      </ul>
    </section>
  );
}

function BlockerRow({ blocker: b }: { blocker: StandupBlocker }) {
  const { t } = useTranslation();
  const { day, me, live, clock } = useDayView();
  const { formatDate } = useDates();
  const resolve = useResolveBlocker(day.group.id, me);
  const [showReplies, setShowReplies] = useState(false);
  const threadId = useId();
  const resolved = b.resolvedAt !== null;
  const canToggle = live && b.canResolve;
  const entry = day.entries.find((e) => e.id === b.entryId);
  return (
    <li
      className={cn(
        'flex items-start gap-3 border-b border-danger-divider px-4 py-3.5 last:border-b-0',
        resolved ? 'bg-subtle' : 'bg-danger-card',
      )}
    >
      <input
        type="checkbox"
        checked={resolved}
        disabled={!canToggle}
        title={canToggle ? undefined : t('standup.day.cantResolve')}
        onChange={(e) => {
          resolve.mutate({ blockerId: b.id, resolved: e.target.checked });
        }}
        aria-label={t('standup.day.markResolved', { text: b.text })}
        className="mt-0.5 size-[18px] flex-none cursor-pointer accent-[var(--success)] disabled:cursor-not-allowed"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span
          className={cn(
            'text-[14px] leading-5 font-medium break-words',
            resolved ? 'text-muted line-through' : 'text-default',
          )}
        >
          {b.text}
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-3">
          <span className="flex items-center gap-1.5">
            <Avatar user={b.author} size={20} textSize={10} title={null} />
            {shortName(b.author.name)} · {clock(b.createdAt)}
            {b.date < day.date && ` · ${t('standup.day.since', { date: formatDate(b.date) })}`}
          </span>
          {b.task && <TaskChip task={b.task} size="lg" />}
          {b.helpers.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {t('standup.day.canHelp')}
              {b.helpers.map((h) => (
                <span
                  key={h.id}
                  className="inline-flex h-[22px] items-center gap-1 rounded-[11px] bg-accent-soft pr-[7px] pl-0.5 font-semibold text-accent-ink"
                >
                  <Avatar user={h} size={20} textSize={10} title={null} />@{shortName(h.name)}
                </span>
              ))}
            </span>
          )}
          <button
            type="button"
            aria-expanded={showReplies}
            aria-controls={threadId}
            onClick={() => {
              setShowReplies(!showReplies);
            }}
            className="inline-flex h-6 items-center gap-1 rounded-[6px] px-1.5 font-medium text-3 hover:bg-hover"
          >
            {b.replies.length > 0
              ? t('standup.day.replies', { count: b.replies.length })
              : t('standup.day.reply')}
            <ChevronDownIcon
              size={10}
              className={cn('transition-transform', showReplies && 'rotate-180')}
            />
          </button>
        </div>
        {showReplies && (
          <div id={threadId} className="flex flex-col gap-2.5 pt-1">
            <ReplyThread replies={b.replies} />
            <ReplyField entryId={b.entryId} blockerId={b.id} to={entry?.user ?? b.author} />
          </div>
        )}
      </div>
      {resolved && (
        <span className="flex h-[22px] flex-none items-center rounded-[11px] bg-success-soft px-2 text-[12px] font-semibold text-success-soft">
          {t('standup.day.resolved')}
        </span>
      )}
    </li>
  );
}
