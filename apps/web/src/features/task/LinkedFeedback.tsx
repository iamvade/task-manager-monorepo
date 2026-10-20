import type { FeedbackReportRef } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useFeedbackOptions, useLinkFeedbackToTask } from '../../api/feedback';
import { useCurrentWorkspace, useWsPath } from '../../api/workspaces';
import { ChevronRightIcon, FeedbackIcon, PlusIcon } from '../../components/icons';
import { Picker } from '../../components/ui/Picker';
import { Popover } from '../../components/ui/Popover';
import { useRelativeTime } from '../../lib/useRelativeTime';
import { toast } from '../../stores/toast';
import { submitterName } from '../feedback/format';
import { TypeBadge } from '../feedback/parts';
import { useTaskView } from './TaskContext';

const SHOWN = 3;

/**
 * "Linked feedback" (TaskDetail.dc.html): customer reports linked to this task, newest first,
 * three then "Show N more"; "+ Link feedback" picks an unlinked report.
 */
export function LinkedFeedback() {
  const { t } = useTranslation();
  const { task, readOnly } = useTaskView();
  const { ago } = useRelativeTime();
  const [all, setAll] = useState(false);
  const reports = task.linkedFeedback;
  if (readOnly && reports.length === 0) return null;
  const shown = all ? reports : reports.slice(0, SHOWN);

  return (
    <section aria-labelledby="linked-fb-h" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3
          id="linked-fb-h"
          className="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-2"
        >
          <FeedbackIcon size={14} className="text-icon" />
          {t('feedback.task.title')}
        </h3>
        {reports.length > 1 && (
          <span className="flex h-5 items-center rounded-full bg-chip px-2 text-[12px] font-medium text-2">
            {t('feedback.task.reportedBy', { count: reports.length })}
          </span>
        )}
        <span className="flex-1" />
        {!readOnly && <LinkFeedbackButton taskId={task.id} />}
      </div>
      <div className="flex flex-col gap-1">
        {shown.map((report) => (
          <ReportRow key={report.id} report={report} when={ago(report.createdAt)} />
        ))}
        {reports.length > SHOWN && (
          <button
            type="button"
            onClick={() => {
              setAll((v) => !v);
            }}
            className="h-[26px] self-start rounded-[6px] px-0.5 text-[12px] font-medium text-2 hover:text-default"
          >
            {all
              ? t('feedback.task.showLess')
              : t('feedback.task.showMore', { count: reports.length - SHOWN })}
          </button>
        )}
        {reports.length === 0 && (
          <span className="text-[13px] text-muted">{t('feedback.task.empty')}</span>
        )}
      </div>
    </section>
  );
}

function ReportRow({ report, when }: { report: FeedbackReportRef; when: string }) {
  const ws = useWsPath();
  const { t } = useTranslation();
  return (
    <Link
      to={ws(`/feedback?item=${report.ref}`)}
      aria-label={t('feedback.task.open', { ref: report.ref, title: report.title })}
      className="flex items-center gap-2.5 rounded-[8px] border border-subtle bg-subtle px-2.5 py-2 text-default hover:bg-hover"
    >
      <TypeBadge type={report.type} compact short />
      <span className="min-w-0 flex-1 truncate text-[13px]">{report.title}</span>
      <span className="flex-none text-[12px] whitespace-nowrap text-muted">
        {submitterName(report)} · {when}
      </span>
      <ChevronRightIcon size={12} className="flex-none text-icon" />
    </Link>
  );
}

function LinkFeedbackButton({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const options = useFeedbackOptions(taskId, query, open);
  const link = useLinkFeedbackToTask(workspace?.id ?? '', taskId);
  const { ago } = useRelativeTime();

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
      label={t('feedback.task.link')}
      width={400}
      placement="bottom-end"
      elevation="lg"
      trigger={(props, isOpen) => (
        <button
          type="button"
          {...props}
          aria-expanded={isOpen}
          className="flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium text-2 hover:bg-hover"
        >
          <PlusIcon size={12} strokeWidth={2.5} />
          {t('feedback.task.link')}
        </button>
      )}
    >
      {(close) => (
        <Picker<FeedbackReportRef>
          items={options.data?.items ?? []}
          value={null}
          getKey={(r) => r.id}
          getLabel={(r) => `${r.ref} ${r.title}`}
          query={query}
          onQueryChange={setQuery}
          search={{ placeholder: t('feedback.task.search') }}
          emptyText={options.isFetching ? t('common.loading') : t('feedback.task.noMatch')}
          label={t('feedback.task.options')}
          tall
          onClose={close}
          onSelect={(report) => {
            close();
            link.mutate(report.id, {
              onSuccess: () => {
                toast({ message: t('feedback.task.linked', { ref: report.ref }) });
              },
              onError: () => {
                toast({ message: t('feedback.task.failed'), tone: 'danger' });
              },
            });
          }}
          renderItem={(r) => (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <TypeBadge type={r.type} compact short />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium">{r.title}</span>
                <span className="truncate text-[11px] text-muted">
                  {r.ref} · {submitterName(r)} · {ago(r.createdAt)}
                </span>
              </span>
            </span>
          )}
        />
      )}
    </Popover>
  );
}
