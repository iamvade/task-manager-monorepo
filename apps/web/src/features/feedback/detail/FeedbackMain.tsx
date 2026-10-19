import { type FeedbackActivity, type FeedbackAttachment, type FeedbackDetail } from '@kite/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { feedbackAttachmentUrl, useAddFeedbackNote } from '../../../api/feedback';
import { PREVIEWABLE } from '../../../api/attachments';
import { useAuth } from '../../../auth/useAuth';
import { DownloadIcon, ImageIcon, LockIcon, MailIcon } from '../../../components/icons';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { toast } from '../../../stores/toast';
import { ImageViewer } from '../../task/attachments/ImageViewer';
import { deviceLine, submitterName, submitterUser, useDateTime } from '../format';
import { TypeBadge } from '../parts';
import { DuplicatesBanner } from './Duplicates';

/** Main column: what was sent, attachments, the submitter, the team's notes and log. */
export function FeedbackMain({
  workspaceId,
  detail,
}: {
  workspaceId: string;
  detail: FeedbackDetail;
}) {
  const { t } = useTranslation();
  const first = detail.linkedReports[0];
  const isFirst = detail.linkedReports.length > 1 && first?.id === detail.id;

  return (
    <div className="flex min-w-0 flex-[999_1_460px] flex-col gap-7 px-7 pt-6 pb-8">
      {detail.task && detail.linkedReports.length > 1 && (
        <DuplicatesBanner reports={detail.linkedReports} taskKey={detail.task.key} />
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={detail.type} />
          <span className="font-mono text-[12px] text-muted">{detail.ref}</span>
          {isFirst ? (
            <span className="flex h-[22px] items-center rounded-full bg-chip px-2 text-[12px] font-semibold text-2">
              {t('feedback.detail.firstReport')}
            </span>
          ) : (
            <span className="text-[12px] text-muted">· {t('feedback.detail.via')}</span>
          )}
        </div>
        <h1
          id="feedback-title"
          className="m-0 text-[22px] leading-[30px] font-semibold tracking-[-0.01em] break-words"
        >
          {detail.title}
        </h1>
        <p className="m-0 text-[15px] leading-6 break-words whitespace-pre-wrap text-body">
          {detail.body}
        </p>
      </div>
      {detail.attachments.length > 0 && <Attachments detail={detail} />}
      <Submitter detail={detail} />
      <Activity workspaceId={workspaceId} detail={detail} />
    </div>
  );
}

function Attachments({ detail }: { detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const { size } = useRelativeTime();
  const [preview, setPreview] = useState<string | null>(null);
  const images = detail.attachments.filter((a) => PREVIEWABLE.has(a.mime));
  const files = detail.attachments.filter((a) => !PREVIEWABLE.has(a.mime));
  const index = images.findIndex((a) => a.id === preview);
  const url = (a: FeedbackAttachment, inline = false) =>
    feedbackAttachmentUrl(detail.id, a.id, { inline });
  const name = submitterName(detail);

  return (
    <section aria-labelledby="fb-att-h" className="flex flex-col gap-2.5">
      <h2 id="fb-att-h" className="m-0 flex items-center gap-2 text-[13px] font-semibold text-2">
        {t('feedback.detail.attachments')}
        <span className="font-normal text-muted">{detail.attachments.length}</span>
      </h2>
      <div className="flex flex-wrap gap-2.5">
        {images.map((a) => (
          <button
            key={a.id}
            type="button"
            aria-label={t('feedback.detail.openPreview', { name: a.filename })}
            onClick={() => {
              setPreview(a.id);
            }}
            className="flex w-[148px] flex-col overflow-hidden rounded-[10px] border border-default bg-surface text-left hover:border-strong"
          >
            <span
              aria-hidden="true"
              className="relative flex h-28 items-center justify-center bg-subtle text-icon"
            >
              <ImageIcon size={24} />
              <img
                src={url(a, true)}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </span>
            <span className="flex flex-col px-2 py-1.5">
              <span className="truncate text-[12px] font-medium">{a.filename}</span>
              <span className="text-[11px] text-muted">{size(a.size)}</span>
            </span>
          </button>
        ))}
        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            {files.map((a) => (
              <a
                key={a.id}
                href={url(a)}
                download={a.filename}
                aria-label={t('feedback.detail.downloadFile', {
                  name: a.filename,
                  size: size(a.size),
                })}
                className="box-border flex w-60 items-center gap-2.5 rounded-[10px] border border-default px-2.5 py-2 text-default hover:bg-hover"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 flex-none items-center justify-center rounded-[8px] bg-chip text-[9px] font-bold text-2 uppercase"
                >
                  {a.filename.split('.').pop()?.slice(0, 4) ?? ''}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium">{a.filename}</span>
                  <span className="text-[12px] text-muted">{size(a.size)}</span>
                </span>
                <DownloadIcon size={15} className="flex-none text-2" />
              </a>
            ))}
          </div>
        )}
      </div>
      {index >= 0 && (
        <ImageViewer
          images={images}
          index={index}
          onIndexChange={(i) => {
            setPreview(images[i]?.id ?? null);
          }}
          onClose={() => {
            setPreview(null);
          }}
          srcOf={(a) => url(a, true)}
          download={(a) => {
            const link = document.createElement('a');
            link.href = url(a);
            link.download = a.filename;
            link.click();
          }}
          meta={(_a, fileSize) => t('feedback.detail.attachedBy', { size: fileSize, name })}
        />
      )}
    </section>
  );
}

function Submitter({ detail }: { detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const dateTime = useDateTime();
  const user = submitterUser(detail);
  const subject = t('feedback.detail.replySubject', { title: detail.title, ref: detail.ref });
  const mailto = `mailto:${detail.email}?subject=${encodeURIComponent(subject)}`;
  const device = deviceLine(detail);

  return (
    <section aria-labelledby="fb-sub-h" className="flex flex-col gap-2.5">
      <h2 id="fb-sub-h" className="m-0 text-[13px] font-semibold text-2">
        {t('feedback.detail.submitter')}
      </h2>
      <div className="flex flex-wrap items-start gap-4 rounded-[12px] border border-default px-4 py-3.5">
        <Avatar user={user} size={40} textSize={14} title={null} />
        <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
          <span className="text-[15px] font-semibold">{user.name}</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
            <a
              href={`mailto:${detail.email}`}
              className="inline-flex items-center gap-1.5 text-accent-ink hover:underline"
            >
              <MailIcon size={13} />
              {detail.email}
            </a>
            {detail.phone ? (
              <a
                href={`tel:${detail.phone.replace(/[^\d+]/g, '')}`}
                className="inline-flex items-center gap-1.5 text-2 hover:underline"
              >
                {detail.phone}
              </a>
            ) : (
              <span className="text-muted">{t('feedback.detail.noPhone')}</span>
            )}
          </span>
          <span className="text-[12px] text-muted">
            {t('feedback.detail.submittedAt', { date: dateTime(detail.createdAt) })}
            {device ? ` · ${device}` : ''}
          </span>
        </div>
        <a
          href={mailto}
          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-[8px] border border-default px-3 text-[13px] font-medium text-2 hover:bg-hover"
        >
          {t('feedback.detail.reply')}
        </a>
      </div>
    </section>
  );
}

function Activity({ workspaceId, detail }: { workspaceId: string; detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const [text, setText] = useState('');
  const addNote = useAddFeedbackNote(workspaceId);
  const submit = () => {
    const value = text.trim();
    if (!value) return;
    addNote.mutate(
      { id: detail.id, text: value },
      {
        onSuccess: () => {
          setText('');
        },
        onError: () => {
          toast({ message: t('feedback.detail.noteFailed'), tone: 'danger' });
        },
      },
    );
  };

  return (
    <section
      aria-labelledby="fb-act-h"
      className="flex flex-col gap-3 border-t border-default pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fb-act-h" className="m-0 text-[13px] font-semibold text-2">
          {t('feedback.detail.activity')}
        </h2>
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-[var(--fb-internal-bg)] px-2 text-[12px] font-medium text-[var(--fb-internal-fg)]">
          <LockIcon size={11} />
          {t('feedback.detail.internalOnly')}
        </span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {detail.activity.map((entry) => (
          <li key={entry.id} className="flex flex-col">
            <ActivityEntry entry={entry} detail={detail} />
          </li>
        ))}
      </ol>
      <div className="flex items-start gap-2.5">
        {me && <Avatar user={me.user} size={22} textSize={9} title={null} />}
        <div className="flex flex-1 flex-col rounded-[10px] border border-default focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--accent)]">
          <label htmlFor="fb-note" className="sr-only">
            {t('feedback.detail.notePlaceholder')}
          </label>
          <textarea
            id="fb-note"
            rows={2}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t('feedback.detail.notePlaceholder')}
            className="resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-[14px] leading-[21px] outline-none"
          />
          <div className="flex items-center gap-2 py-1 pr-1.5 pb-1.5 pl-3">
            <span className="flex flex-1 items-center gap-1.5 text-[12px] text-muted">
              <LockIcon size={11} />
              {t('feedback.detail.noteHint')}
            </span>
            <Button
              variant="primary"
              size="sm"
              disabled={!text.trim() || addNote.isPending}
              onClick={submit}
            >
              {t('feedback.detail.addNote')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

const MARK: Partial<Record<FeedbackActivity['kind'], string>> = {
  linked: 'var(--fb-status-linked)',
  unlinked: 'var(--fb-status-linked)',
  similar_found: 'var(--accent)',
  assignee_change: 'var(--accent)',
};

function ActivityEntry({ entry, detail }: { entry: FeedbackActivity; detail: FeedbackDetail }) {
  const { t } = useTranslation();
  const { ago } = useRelativeTime();
  const time = (
    <time dateTime={entry.createdAt} className="flex-none text-[12px] text-muted">
      {ago(entry.createdAt)}
    </time>
  );
  if (entry.kind === 'note') {
    const who = entry.actor?.name ?? t('feedback.detail.event.someone');
    return (
      <div className="flex items-start gap-2.5 py-2">
        {entry.actor ? (
          <Avatar user={entry.actor} size={22} textSize={9} title={null} />
        ) : (
          <span className="size-[22px] flex-none" />
        )}
        <div className="flex flex-1 flex-col gap-1 rounded-[10px] border border-[var(--fb-note-border)] bg-[var(--fb-note-bg)] px-3 py-2.5">
          <span className="flex items-baseline gap-1.5 text-[13px]">
            <strong className="font-semibold">{who}</strong>
            {time}
          </span>
          <span className="text-[14px] leading-[21px] break-words whitespace-pre-wrap text-body">
            {entry.text}
          </span>
        </div>
      </div>
    );
  }
  const status = (s: string | undefined) =>
    s ? t(`feedback.status.${s}` as 'feedback.status.new') : '';
  const key = entry.data.task?.key ?? '';
  const who =
    entry.kind === 'created'
      ? submitterName(detail)
      : entry.kind === 'similar_found'
        ? t('feedback.detail.event.system')
        : (entry.actor?.name ?? t('feedback.detail.event.someone'));
  const text = (() => {
    switch (entry.kind) {
      case 'created':
        return t('feedback.detail.event.created');
      case 'similar_found': {
        const refs = entry.data.similar?.map((s) => s.ref) ?? [];
        return t('feedback.detail.event.similar', { count: refs.length, refs: refs.join(', ') });
      }
      case 'status_change':
        return t('feedback.detail.event.status', {
          from: status(entry.data.from),
          to: status(entry.data.to),
        });
      case 'linked':
        return entry.data.statusSet
          ? t('feedback.detail.event.linkedStatus', { key, status: status('linked') })
          : t('feedback.detail.event.linked', { key });
      case 'unlinked':
        return entry.data.reason === 'task_deleted'
          ? t('feedback.detail.event.unlinkedDeleted', { key })
          : t('feedback.detail.event.unlinked', { key });
      case 'assignee_change': {
        const names = entry.data.assignees?.map((a) => a.name) ?? [];
        return names.length > 0
          ? t('feedback.detail.event.assignee', { names: names.join(', '), key })
          : t('feedback.detail.event.unassigned', { key });
      }
      default:
        return '';
    }
  })();
  const mark =
    entry.kind === 'status_change' && entry.data.to === 'review'
      ? 'var(--fb-status-review)'
      : (MARK[entry.kind] ?? 'var(--border-strong)');
  return (
    <div className="flex items-start gap-2.5 py-1.5 text-[13px] leading-5 text-2">
      <span aria-hidden="true" className="flex h-5 w-[22px] flex-none items-center justify-center">
        <span className="size-2 rounded-full" style={{ background: mark }} />
      </span>
      <span className="flex-1">
        <strong className="font-semibold text-default">{who}</strong> {text}
      </span>
      {time}
    </div>
  );
}
