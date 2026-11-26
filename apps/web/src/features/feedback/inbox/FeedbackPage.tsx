import {
  FEEDBACK_NO_TOPIC,
  FEEDBACK_PAGE_SIZE,
  feedbackTopicKeySchema,
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  feedbackStatusSchema,
  feedbackTypeSchema,
  type FeedbackStatus,
  type FeedbackTopicWithCount,
} from '@kite/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useSearchParams } from 'react-router';
import {
  publicFeedbackUrl,
  useFeedbackList,
  useFeedbackTopics,
  type FeedbackListParams,
} from '../../../api/feedback';
import { useCurrentWorkspace } from '../../../api/workspaces';
import { ErrorState } from '../../../components/ErrorState';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FeedbackIcon,
  SearchIcon,
} from '../../../components/icons';
import { Menu, type MenuItem } from '../../../components/ui/Menu';
import { Skeleton } from '../../../components/ui/Skeleton';
import { UnderlineTabs } from '../../../components/ui/UnderlineTabs';
import { cn } from '../../../lib/cn';
import { PageHeader } from '../../views/PageHeader';
import { FeedbackDrawer } from '../detail/FeedbackDrawer';
import { FeedbackStatusDot, TypeDot } from '../parts';
import { useCopy, useCopyTopicLink } from '../useCopy';
import { FeedbackEmpty } from './FeedbackEmpty';
import { FeedbackTable } from './FeedbackTable';
import { TopicsDialog } from './TopicsDialog';
import { BASE_PATH } from '../../../lib/basePath';

const SEARCH_DELAY_MS = 250;

/** The filters in the URL: `q`, `type`, `status` (repeated), `page` (1-based) and `item`. */
function useFilters() {
  const [params, setParams] = useSearchParams();
  const type = feedbackTypeSchema.safeParse(params.get('type')).data;
  const statuses = params
    .getAll('status')
    .flatMap((s) => feedbackStatusSchema.safeParse(s).data ?? []);
  const q = params.get('q') ?? '';
  const rawTopic = params.get('topic');
  const topic =
    rawTopic === FEEDBACK_NO_TOPIC
      ? FEEDBACK_NO_TOPIC
      : feedbackTopicKeySchema.safeParse(rawTopic).data;
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const { pathname } = useLocation();
  // The search box writes `q` from a timer, which can fire after a click navigated (opened an
  // item) but before React re-rendered: start from the address bar, which the browser router
  // updates at once (the memory router in tests doesn't touch it, so it falls back to `params`).
  const current = () =>
    new URLSearchParams(
      window.location.pathname === BASE_PATH + pathname ? window.location.search : params,
    );
  /** Changes the filters (back to page 1); `replace` for typing in the search box. */
  const update = (edit: (next: URLSearchParams) => void, replace = false) => {
    const next = current();
    edit(next);
    next.delete('page');
    setParams(next, { replace });
  };
  const setPage = (n: number) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (n <= 1) next.delete('page');
      else next.set('page', String(n));
      return next;
    });
  };
  /** `?…` for a type tab, keeping the search. */
  const typeHref = (value: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('page');
    next.delete('item');
    next.delete('status');
    if (value) next.set('type', value);
    else next.delete('type');
    const s = next.toString();
    return s ? `?${s}` : '?';
  };
  return { params, type, statuses, topic, q, page, update, setPage, typeHref };
}

/** Feedback inbox (Feedback.dc.html): search, type tabs, status chips, the table, the panel. */
export function FeedbackPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const workspaceId = workspace?.id ?? '';
  const { type, statuses, topic, q, page, update, setPage, typeHref } = useFilters();
  const topics = useFeedbackTopics(workspace?.id);
  const [managing, setManaging] = useState(false);
  const [search, setSearch] = useState(q);
  // The box drives `q` after a pause; a back/forward to another `q` drives the box.
  const [shownQ, setShownQ] = useState(q);
  if (shownQ !== q) {
    setShownQ(q);
    setSearch(q);
  }
  useEffect(() => {
    if (search.trim() === q) return;
    const timer = setTimeout(() => {
      update((next) => {
        if (search.trim()) next.set('q', search.trim());
        else next.delete('q');
      }, true);
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` is rebuilt each render
  }, [search, q]);

  const listParams: FeedbackListParams = {
    q: q || undefined,
    type,
    status: statuses.length > 0 ? statuses : undefined,
    topic,
    offset: (page - 1) * FEEDBACK_PAGE_SIZE,
    limit: FEEDBACK_PAGE_SIZE,
  };
  const list = useFeedbackList(workspace?.id, listParams);
  const data = list.data;
  const nothingYet = data?.typeCounts.all === 0 && !q && !topic;

  const toggleStatus = (status: FeedbackStatus) => {
    update((next) => {
      const set = new Set(next.getAll('status'));
      if (set.has(status)) set.delete(status);
      else set.add(status);
      next.delete('status');
      for (const s of FEEDBACK_STATUSES) if (set.has(s)) next.append('status', s);
    });
  };

  return (
    <>
      <PageHeader
        title={
          <h1 className="m-0 flex min-w-0 items-center gap-2 text-[16px] leading-6 font-semibold">
            <FeedbackIcon size={18} className="flex-none text-2" />
            <span className="truncate">{t('feedback.inbox.title')}</span>
          </h1>
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {!nothingYet && (
              <label className="flex h-9 w-[320px] max-w-full items-center gap-2 rounded-[8px] border border-default bg-surface px-2.5 focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--accent)]">
                <SearchIcon size={14} className="flex-none text-icon" />
                <span className="sr-only">{t('feedback.inbox.search')}</span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  placeholder={t('feedback.inbox.search')}
                  className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] outline-none"
                />
              </label>
            )}
            {workspace && (
              <PublicLinkPill
                slug={workspace.slug}
                compact={nothingYet}
                topics={topics.data ?? []}
                onManage={() => {
                  setManaging(true);
                }}
              />
            )}
          </div>
        }
        tabs={
          <UnderlineTabs
            label={t('feedback.inbox.typeFilter')}
            value={type ?? 'all'}
            items={[null, ...FEEDBACK_TYPES].map((value) => ({
              value: value ?? 'all',
              label: value ? t(`feedback.type.${value}`) : t('feedback.inbox.all'),
              icon: value ? <TypeDot type={value} /> : undefined,
              trailing: (
                <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-chip px-[5px] text-[11px] font-semibold text-2">
                  {data ? data.typeCounts[value ?? 'all'] : '·'}
                </span>
              ),
              to: typeHref(value),
            }))}
          />
        }
      />

      {list.isError ? (
        <ErrorState error={list.error} />
      ) : !data ? (
        <TableSkeleton />
      ) : nothingYet ? (
        <FeedbackEmpty slug={workspace?.slug ?? ''} />
      ) : (
        <>
          <div
            role="group"
            aria-label={t('feedback.inbox.statusFilter')}
            className="flex flex-wrap items-center gap-2 px-6 pt-3"
          >
            <span className="text-[12px] text-muted">{t('feedback.inbox.statusLabel')}</span>
            {FEEDBACK_STATUSES.map((status) => {
              const on = statuses.includes(status);
              return (
                <button
                  key={status}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    toggleStatus(status);
                  }}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium',
                    on
                      ? 'border-[var(--accent)] bg-accent-soft text-default'
                      : 'border-default bg-surface text-2 hover:bg-hover',
                  )}
                >
                  <FeedbackStatusDot status={status} size={8} />
                  {t(`feedback.status.${status}`)}
                  <span className="font-normal text-muted">{data.statusCounts[status]}</span>
                </button>
              );
            })}
            {((topics.data?.length ?? 0) > 0 || topic) && (
              <TopicFilter
                topics={topics.data ?? []}
                value={topic}
                onChange={(next) => {
                  update((params) => {
                    if (next) params.set('topic', next);
                    else params.delete('topic');
                  });
                }}
              />
            )}
            {statuses.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  update((next) => {
                    next.delete('status');
                  });
                }}
                className="h-7 rounded-[6px] px-2 text-[12px] font-medium text-accent-ink hover:bg-hover"
              >
                {t('feedback.inbox.clear')}
              </button>
            )}
            <span className="flex-1" />
            <span className="text-[12px] text-muted" aria-live="polite">
              {t('feedback.inbox.summary', { count: data.total, unread: data.unread })}
            </span>
          </div>
          <FeedbackTable
            key={JSON.stringify(listParams)}
            workspaceId={workspaceId}
            data={data}
            page={page}
            onPage={setPage}
          />
        </>
      )}
      <FeedbackDrawer workspaceId={workspaceId} order={data?.items ?? []} />
      {workspace && (
        <TopicsDialog
          open={managing}
          onClose={() => {
            setManaging(false);
          }}
          workspaceId={workspace.id}
          slug={workspace.slug}
          role={workspace.role}
        />
      )}
    </>
  );
}

/**
 * The public form's address and a copy button (header; empty state has a bigger one), plus a menu
 * to copy a link with a topic picked and to manage the topics.
 */
function PublicLinkPill({
  slug,
  compact,
  topics,
  onManage,
}: {
  slug: string;
  compact: boolean;
  topics: readonly FeedbackTopicWithCount[];
  onManage: () => void;
}) {
  const { t } = useTranslation();
  const { copied, copy } = useCopy();
  const copyTopic = useCopyTopicLink(slug);
  const url = publicFeedbackUrl(slug);
  const items: MenuItem[] = [
    ...(topics.length > 0
      ? ([
          { type: 'heading', id: 'by-topic', label: t('feedback.topics.linkByTopic') },
          ...topics.map((topic) => ({
            id: topic.id,
            label: topic.name,
            icon: <CopyIcon size={14} />,
            onSelect: () => {
              copyTopic(topic);
            },
          })),
          { type: 'separator', id: 'sep' },
        ] satisfies MenuItem[])
      : []),
    { id: 'manage', label: t('feedback.topics.manage'), onSelect: onManage },
  ];
  const button = (
    <button
      type="button"
      onClick={() => {
        copy(url);
      }}
      aria-live="polite"
      className={cn(
        'flex h-9 items-center gap-1.5 px-3 text-[13px] font-medium',
        copied ? 'bg-success-soft text-success-soft' : 'bg-surface text-default hover:bg-hover',
      )}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      {copied ? t('feedback.inbox.copied') : t('feedback.inbox.copyLink')}
    </button>
  );
  const menu = (
    <Menu
      label={t('feedback.topics.linkMenu')}
      placement="bottom-end"
      width={240}
      items={items}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={t('feedback.topics.linkMenu')}
          className="flex h-9 w-8 items-center justify-center bg-surface text-icon hover:bg-hover"
        >
          <ChevronDownIcon size={12} />
        </button>
      )}
    />
  );
  const divider = <span className="h-full w-px bg-[var(--border)]" aria-hidden="true" />;
  return (
    <div className="flex h-9 items-center overflow-hidden rounded-[8px] border border-default">
      {!compact && (
        <>
          <span
            title={url}
            className="max-w-[200px] truncate px-2.5 font-mono text-[12px] text-muted"
          >
            {url.replace(/^https?:\/\//, '')}
          </span>
          {divider}
        </>
      )}
      {button}
      {divider}
      {menu}
    </div>
  );
}

/** "Topic: …" filter next to the status chips (`?topic=` key, or `none`). */
function TopicFilter({
  topics,
  value,
  onChange,
}: {
  topics: readonly FeedbackTopicWithCount[];
  value: string | undefined;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const current = topics.find((x) => x.key === value);
  const shown =
    value === FEEDBACK_NO_TOPIC
      ? t('feedback.topics.none')
      : (current?.name ?? value ?? t('feedback.topics.filterAll'));
  return (
    <Menu
      label={t('feedback.topics.filterLabel')}
      width={240}
      items={[
        {
          id: 'all',
          label: t('feedback.topics.filterAll'),
          checked: !value,
          onSelect: () => {
            onChange(null);
          },
        },
        { type: 'separator', id: 'sep' },
        ...topics.map((x) => ({
          id: x.id,
          label: x.name,
          checked: x.key === value,
          trailing: <span className="text-[12px] text-muted tabular-nums">{x.feedbackCount}</span>,
          onSelect: () => {
            onChange(x.key);
          },
        })),
        {
          id: 'none',
          label: t('feedback.topics.none'),
          checked: value === FEEDBACK_NO_TOPIC,
          onSelect: () => {
            onChange(FEEDBACK_NO_TOPIC);
          },
        },
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium',
            value
              ? 'border-[var(--accent)] bg-accent-soft text-default'
              : 'border-default bg-surface text-2 hover:bg-hover',
          )}
        >
          <span className="text-muted">{t('feedback.topics.filter')}:</span>
          <span className="max-w-[160px] truncate">{shown}</span>
          <ChevronDownIcon size={10} className="text-icon" />
        </button>
      )}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-6 pt-6" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} height={48} />
      ))}
    </div>
  );
}
