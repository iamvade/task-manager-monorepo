import {
  FEEDBACK_PAGE_SIZE,
  FEEDBACK_STATUSES,
  type FeedbackBatch,
  type FeedbackListItem,
  type FeedbackListResponse,
  type FeedbackStatus,
} from '@kite/shared';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { useFeedbackBatch } from '../../../api/feedback';
import {
  ArchiveIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  LinkIcon,
  NextIcon,
  PaperclipIcon,
  PrevIcon,
  StatusIcon,
} from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Checkbox } from '../../../components/ui/Checkbox';
import { IconButton } from '../../../components/ui/IconButton';
import { Menu } from '../../../components/ui/Menu';
import { Tooltip } from '../../../components/ui/Tooltip';
import { cn } from '../../../lib/cn';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { toast } from '../../../stores/toast';
import { submitterName, useDateTime } from '../format';
import { FeedbackStatusDot, TypeBadge } from '../parts';
import { TaskPickerPopover } from '../TaskPicker';

const GRID = 'grid grid-cols-[40px_148px_minmax(0,1fr)_28px_200px_220px_132px_96px] items-center';

interface FeedbackTableProps {
  workspaceId: string;
  data: FeedbackListResponse;
  /** 1-based. */
  page: number;
  onPage: (page: number) => void;
}

/** The inbox table (Feedback.dc.html): selection, bulk bar in place of the header, pages. */
export function FeedbackTable({ workspaceId, data, page, onPage }: FeedbackTableProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const items = data.items;
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  };
  const from = data.total === 0 ? 0 : (page - 1) * FEEDBACK_PAGE_SIZE + 1;
  const to = (page - 1) * FEEDBACK_PAGE_SIZE + items.length;
  const pages = Math.max(1, Math.ceil(data.total / FEEDBACK_PAGE_SIZE));

  return (
    <div className="overflow-x-auto px-6 pt-3 pb-8">
      <div role="table" aria-label={t('feedback.inbox.table')} className="min-w-[1080px]">
        <div role="rowgroup">
          {selected.size > 0 ? (
            <SelectionBar
              workspaceId={workspaceId}
              ids={[...selected]}
              allSelected={allSelected}
              onToggleAll={toggleAll}
              onDone={() => {
                setSelected(new Set());
              }}
            />
          ) : (
            <div
              role="row"
              className={cn(
                GRID,
                'h-11 border-b border-default px-2 text-[12px] font-medium text-muted',
              )}
            >
              <span role="columnheader" className="flex justify-center">
                <Checkbox
                  checked={allSelected}
                  onChange={toggleAll}
                  label={t('feedback.inbox.selectAll')}
                  disabled={items.length === 0}
                />
              </span>
              <span role="columnheader">{t('feedback.inbox.col.type')}</span>
              <span role="columnheader">{t('feedback.inbox.col.title')}</span>
              <span role="columnheader">
                <span className="sr-only">{t('feedback.inbox.col.attachment')}</span>
              </span>
              <span role="columnheader">{t('feedback.inbox.col.from')}</span>
              <span role="columnheader">{t('feedback.inbox.col.task')}</span>
              <span role="columnheader">{t('feedback.inbox.col.status')}</span>
              <span role="columnheader" className="text-right">
                {t('feedback.inbox.col.date')}
              </span>
            </div>
          )}
        </div>
        <div role="rowgroup">
          {items.map((item) => (
            <FeedbackRow
              key={item.id}
              item={item}
              selected={selected.has(item.id)}
              onToggle={() => {
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              }}
            />
          ))}
          {items.length === 0 && (
            <FullRow>
              <p className="m-0 px-4 py-12 text-center text-[13px] text-muted">
                {t('feedback.inbox.noMatch')}
              </p>
            </FullRow>
          )}
          <FullRow>
            <div className="flex h-11 items-center justify-between text-[12px] text-muted">
              <span>{t('feedback.inbox.range', { from, to, total: data.total })}</span>
              {pages > 1 && (
                <span className="flex items-center gap-1">
                  <IconButton
                    label={t('feedback.inbox.prevPage')}
                    icon={<PrevIcon size={14} />}
                    size={28}
                    disabled={page <= 1}
                    onClick={() => {
                      onPage(page - 1);
                    }}
                  />
                  <IconButton
                    label={t('feedback.inbox.nextPage')}
                    icon={<NextIcon size={14} />}
                    size={28}
                    disabled={page >= pages}
                    onClick={() => {
                      onPage(page + 1);
                    }}
                  />
                </span>
              )}
            </div>
          </FullRow>
        </div>
      </div>
    </div>
  );
}

function FullRow({ children }: { children: ReactNode }) {
  return (
    <div role="row" className="flex flex-col">
      <div role="cell" className="flex flex-col">
        {children}
      </div>
    </div>
  );
}

function FeedbackRow({
  item,
  selected,
  onToggle,
}: {
  item: FeedbackListItem;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const { ago } = useRelativeTime();
  const dateTime = useDateTime();
  const unread = !item.isRead;
  const params = new URLSearchParams(location.search);
  params.set('item', item.ref);
  const taskParams = new URLSearchParams(location.search);
  if (item.task) taskParams.set('task', item.task.key);
  taskParams.delete('item');
  const assignee = item.task?.assignees[0];
  const name = submitterName(item);

  return (
    <div
      role="row"
      data-feedback-ref={item.ref}
      className={cn(
        GRID,
        'min-h-[60px] border-b border-subtle px-2',
        selected ? 'bg-accent-soft' : unread ? 'bg-[var(--fb-unread-row)]' : 'hover:bg-hover',
      )}
    >
      <span role="cell" className="relative flex items-center justify-center">
        {unread && (
          <span
            role="img"
            aria-label={t('feedback.inbox.unread')}
            className="absolute -left-1 size-1.5 rounded-full bg-accent"
          />
        )}
        <Checkbox
          checked={selected}
          onChange={onToggle}
          label={t('feedback.inbox.select', { title: item.title })}
        />
      </span>
      <span role="cell">
        <TypeBadge type={item.type} />
      </span>
      <span role="cell" className="flex min-w-0 flex-col gap-0.5 py-2 pr-4">
        <Link
          to={{ search: `?${params.toString()}` }}
          className={cn(
            'truncate text-[14px] hover:underline',
            unread ? 'font-semibold text-default' : 'font-normal text-default',
          )}
        >
          {item.title}
        </Link>
        <span className="truncate text-[12px] leading-4 text-muted">{item.preview}</span>
      </span>
      <span role="cell" className="flex justify-center">
        {item.attachmentCount > 0 && (
          <span role="img" aria-label={t('feedback.inbox.hasAttachment')} className="text-icon">
            <PaperclipIcon size={15} />
          </span>
        )}
      </span>
      <span role="cell" className="flex min-w-0 flex-col pr-3">
        <span className="truncate text-[13px] text-default">{name}</span>
        <span className="truncate text-[12px] leading-4 text-muted">{item.email}</span>
      </span>
      <span role="cell" className="min-w-0 pr-3">
        {item.task && item.status === 'linked' ? (
          <Link
            to={{ search: `?${taskParams.toString()}` }}
            className="box-border inline-flex h-[26px] max-w-full items-center gap-1.5 rounded-[6px] border border-default bg-surface pr-1 pl-2 text-[12px] text-default hover:bg-hover"
          >
            <CheckCircleIcon size={12} className="flex-none text-icon" />
            <span className="truncate">{item.task.title}</span>
            {assignee && <Avatar user={assignee} size={20} textSize={9} />}
          </Link>
        ) : (
          <span className="text-[12px] text-muted">
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t('feedback.inbox.noTask')}</span>
          </span>
        )}
      </span>
      <span role="cell" className="flex items-center gap-1.5 text-[13px] text-2">
        <FeedbackStatusDot status={item.status} />
        {t(`feedback.status.${item.status}`)}
      </span>
      <span role="cell" className="text-right">
        <Tooltip content={dateTime(item.createdAt)}>
          {(props) => (
            <time
              {...props}
              tabIndex={0}
              dateTime={item.createdAt}
              className={cn(
                'text-[12px] whitespace-nowrap',
                unread ? 'font-semibold text-default' : 'text-muted',
              )}
            >
              {ago(item.createdAt)}
            </time>
          )}
        </Tooltip>
      </span>
    </div>
  );
}

/** Dark toolbar replacing the header while rows are selected. */
function SelectionBar({
  workspaceId,
  ids,
  allSelected,
  onToggleAll,
  onDone,
}: {
  workspaceId: string;
  ids: string[];
  allSelected: boolean;
  onToggleAll: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const batch = useFeedbackBatch(workspaceId);
  // The bar unmounts as soon as the selection clears: `mutateAsync` still reports back.
  const run = (change: FeedbackBatch['change'], done: string) => {
    batch.mutateAsync({ ids, change }).then(
      () => {
        toast({ message: done });
      },
      () => {
        toast({ message: t('feedback.bulk.failed'), tone: 'danger' });
      },
    );
    onDone();
  };
  const setStatus = (status: FeedbackStatus) => {
    run(
      { action: 'status', status },
      t('feedback.bulk.statusDone', { count: ids.length, status: t(`feedback.status.${status}`) }),
    );
  };
  const control =
    'flex h-[30px] items-center gap-1.5 rounded-[6px] bg-[var(--selection-bar-control)] px-2.5 text-[13px] font-medium text-[var(--selection-bar-fg)] hover:bg-[var(--selection-bar-control-hover)] focus-visible:outline-[var(--accent-ink)]';

  return (
    <div
      role="row"
      className="flex h-11 items-center gap-2 rounded-[10px] bg-[var(--selection-bar-bg)] px-2 text-[var(--selection-bar-fg)]"
    >
      <div role="columnheader" className="flex flex-1 items-center gap-2">
        <div
          role="toolbar"
          aria-label={t('feedback.bulk.label')}
          className="flex flex-1 items-center gap-2"
        >
          <Checkbox
            checked={allSelected}
            onChange={onToggleAll}
            label={t('feedback.inbox.selectAll')}
            className="mr-3 ml-1"
          />
          <span className="min-w-24 text-[13px] font-semibold" aria-live="polite">
            {t('feedback.bulk.selected', { count: ids.length })}
          </span>
          <span className="h-5 w-px bg-[var(--selection-bar-divider)]" aria-hidden="true" />
          <Menu
            label={t('feedback.bulk.changeStatus')}
            width={200}
            items={FEEDBACK_STATUSES.map((status) => ({
              id: status,
              label: t(`feedback.status.${status}`),
              icon: <FeedbackStatusDot status={status} />,
              onSelect: () => {
                setStatus(status);
              },
            }))}
            trigger={(props) => (
              <button type="button" {...props} className={control}>
                <StatusIcon size={13} />
                {t('feedback.bulk.changeStatus')}
                <ChevronDownIcon size={11} />
              </button>
            )}
          />
          <TaskPickerPopover
            onPick={(task) => {
              run(
                { action: 'link', taskId: task.id },
                t('feedback.bulk.linkedDone', { count: ids.length, key: task.key }),
              );
            }}
            trigger={(props) => (
              <button type="button" {...props} className={control}>
                <LinkIcon size={13} />
                {t('feedback.bulk.linkTask')}
              </button>
            )}
          />
          <button
            type="button"
            className={control}
            onClick={() => {
              setStatus('closed');
            }}
          >
            <ArchiveIcon size={13} />
            {t('feedback.bulk.close')}
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onDone}
            className="h-[30px] rounded-[6px] px-2.5 text-[13px] text-[var(--selection-bar-muted)] hover:bg-[var(--selection-bar-control)] focus-visible:outline-[var(--accent-ink)]"
          >
            {t('feedback.bulk.clear')}
          </button>
        </div>
      </div>
    </div>
  );
}
