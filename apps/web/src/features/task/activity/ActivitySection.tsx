import type { CommentFeedItem, FeedType, HistoryEntry } from '@kite/shared';
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useTaskActivity } from '../../../api/activity';
import { SegmentedControl } from '../../../components/ui/SegmentedControl';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useDates } from '../../../lib/useDates';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { useTaskView } from '../TaskContext';
import { CommentComposer } from './CommentComposer';
import { CommentItem } from './CommentItem';
import { historyLine, historyMarker, lineComponents, type HistoryLine } from './historyLine';

type Row = { item: CommentFeedItem; line: null } | { item: HistoryEntry; line: HistoryLine };

function HistoryItem({ entry, line }: { entry: HistoryEntry; line: HistoryLine }) {
  const { ago } = useRelativeTime();
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-[13px] leading-5 text-3">
      <span aria-hidden="true" className="flex h-5 w-6 flex-none items-center justify-center">
        <span className="size-2 rounded-full" style={{ background: historyMarker(entry) }} />
      </span>
      <span className="min-w-0 flex-1">
        <Trans
          i18nKey={`drawer.history.${line.key}`}
          values={line.values}
          components={lineComponents(line)}
        />
      </span>
      <time dateTime={entry.createdAt} className="flex-none text-[12px] text-muted">
        {ago(entry.createdAt)}
      </time>
    </div>
  );
}

function CommentThread({ comment }: { comment: CommentFeedItem }) {
  const [open, setOpen] = useState(false);
  const [replying, setReplying] = useState(false);
  return (
    <div className="flex flex-col">
      <CommentItem
        comment={comment}
        replies={comment.replies}
        repliesOpen={open}
        onToggleReplies={() => {
          setOpen((o) => !o);
        }}
        onReply={() => {
          setReplying(true);
          setOpen(true);
        }}
      />
      {(open || replying) && (
        <div className="ml-[34px] flex flex-col">
          {open &&
            comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                onReply={() => {
                  setReplying(true);
                }}
              />
            ))}
          {replying && (
            <div className="py-2">
              <CommentComposer
                parentId={comment.id}
                autoFocus
                onDone={() => {
                  setReplying(false);
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Activity (TaskDetail.dc.html): All / Comments / History tabs over the merged feed. History
 * lines have bold names and status pills; comments are threads with collapsed replies.
 */
export function ActivitySection() {
  const { t } = useTranslation();
  const { task } = useTaskView();
  const { formatDate } = useDates();
  const activity = useTaskActivity(task.id);
  const [tab, setTab] = useState<FeedType>('all');

  // Lines are built in feed order so "changed status to …" knows the status shown before it.
  const rows = useMemo(() => {
    const out: Row[] = [];
    let status: string | undefined;
    for (const item of activity.data ?? []) {
      if (item.kind === 'comment') {
        out.push({ item, line: null });
        continue;
      }
      const line = historyLine(item, { t, formatDate }, status);
      if (item.type === 'status.changed') status = item.payload.to.id;
      if (item.type === 'task.created') status = item.payload.status?.id;
      if (line) out.push({ item, line });
    }
    return out;
  }, [activity.data, t, formatDate]);

  const visible = rows.filter(
    (row) => tab === 'all' || (tab === 'comments' ? row.line === null : row.line !== null),
  );

  return (
    <section aria-labelledby="act-h" className="flex flex-col gap-3 border-t border-default pt-5">
      <div className="flex items-center justify-between gap-2">
        <h3 id="act-h" className="m-0 text-[13px] font-semibold text-2">
          {t('drawer.activity')}
        </h3>
        <SegmentedControl
          role="tablist"
          size="tabs"
          label={t('drawer.activityFilter')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: t('drawer.tabs.all') },
            { value: 'comments', label: t('drawer.tabs.comments') },
            { value: 'history', label: t('drawer.tabs.history') },
          ]}
        />
      </div>
      {activity.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-3 py-1">
          <Skeleton width="80%" />
          <Skeleton width="60%" />
          <Skeleton width="70%" />
        </div>
      ) : activity.isError ? (
        <p role="alert" className="m-0 text-[13px] text-muted">
          {t('drawer.activityError')}
        </p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {visible.map((row) => (
            <li key={row.item.id} className="flex flex-col">
              {row.line ? (
                <HistoryItem entry={row.item} line={row.line} />
              ) : (
                <CommentThread comment={row.item} />
              )}
            </li>
          ))}
          {visible.length === 0 && (
            <li className="py-2 text-[13px] text-muted">{t('drawer.noComments')}</li>
          )}
        </ol>
      )}
    </section>
  );
}
