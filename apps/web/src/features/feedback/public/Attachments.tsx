import { FEEDBACK_ACCEPT } from '@kite/shared';
import { useState, type ChangeEvent, type DragEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { cn } from '../../../lib/cn';
import { CheckIcon, CloseIcon, PaperclipIcon, PlayIcon, UploadIcon } from './publicIcons';
import type { UploadErrorCode, UploadItem } from './useUploads';
import { useFileSize } from './useFileSize';

interface AttachmentsProps {
  items: UploadItem[];
  maxFiles: number;
  maxFileBytes: number;
  limitHit: boolean;
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}

/** "Attachments (optional)": drop zone + browse, then one row per file (PublicFeedback.dc.html). */
export function Attachments({
  items,
  maxFiles,
  maxFileBytes,
  limitHit,
  disabled,
  onAdd,
  onRemove,
}: AttachmentsProps) {
  const { t } = useTranslation();
  const size = useFileSize();
  const [dragging, setDragging] = useState(false);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(e.target.files ?? []));
    e.target.value = '';
  };
  const onDragOver = (e: DragEvent) => {
    if (disabled || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    setDragging(false);
    if (disabled) return;
    e.preventDefault();
    onAdd(Array.from(e.dataTransfer.files));
  };

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p id="fb-files-label" className="m-0 text-[14px] font-semibold">
          {t('feedbackPublic.filesLabel')}{' '}
          <span className="font-normal text-muted">{t('feedbackPublic.optional')}</span>
        </p>
        <span className="text-[12px] text-muted tabular-nums">
          {items.length}/{maxFiles}
        </span>
      </div>
      <label
        htmlFor="fb-files"
        onDragOver={onDragOver}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          'relative flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-[1.5px] border-dashed px-4 py-6 text-center',
          'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent-ink',
          dragging ? 'border-accent bg-accent-soft' : 'border-strong bg-subtle',
        )}
      >
        <input
          id="fb-files"
          type="file"
          multiple
          accept={FEEDBACK_ACCEPT}
          onChange={onChange}
          aria-labelledby="fb-files-label fb-files-drop"
          aria-describedby="fb-files-note"
          className="absolute size-px overflow-hidden opacity-0"
        />
        <span
          aria-hidden="true"
          className="inline-flex size-10 items-center justify-center rounded-[12px] border border-default bg-surface text-accent-ink"
        >
          <UploadIcon size={20} />
        </span>
        <span id="fb-files-drop" className="text-[14px] text-2">
          <Trans
            i18nKey="feedbackPublic.drop"
            components={{
              browse: (
                <span className="font-semibold text-accent-ink underline underline-offset-[3px]" />
              ),
            }}
          />
        </span>
        <span id="fb-files-note" className="text-[12px] leading-[17px] text-muted">
          {t('feedbackPublic.filesNote', { max: size(maxFileBytes), files: maxFiles })}
        </span>
      </label>
      {limitHit && (
        <p className="m-0 mt-2 text-[12px] leading-[17px] text-muted" role="status">
          {t('feedbackPublic.fileLimit', { files: maxFiles })}
        </p>
      )}

      {items.length > 0 && (
        <ul
          aria-labelledby="fb-files-label"
          className="m-0 mt-2.5 flex list-none flex-col gap-2 p-0"
        >
          {items.map((item) => (
            <FileRow
              key={item.key}
              item={item}
              maxFileBytes={maxFileBytes}
              onRemove={() => {
                onRemove(item.key);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function FileRow({
  item,
  maxFileBytes,
  onRemove,
}: {
  item: UploadItem;
  maxFileBytes: number;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const size = useFileSize();
  const removeLabel =
    item.status === 'uploading'
      ? t('feedbackPublic.cancelAria', { name: item.name })
      : t('feedbackPublic.removeAria', { name: item.name });
  const errorText = (code: UploadErrorCode) =>
    code === 'tooBig'
      ? t('feedbackPublic.tooBig', { max: size(maxFileBytes) })
      : t(`feedbackPublic.${code}`);

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-[10px] border p-2',
        item.status === 'error'
          ? 'border-[var(--form-error-border)] bg-[var(--form-error-row-bg)]'
          : 'border-default bg-surface',
      )}
    >
      <Thumb item={item} />
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[14px] font-medium text-default">{item.name}</p>
        {item.status === 'done' && (
          <p className="m-0 mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <CheckIcon size={12} className="flex-none text-success" />
            {size(item.size)} · {t('feedbackPublic.uploaded')}
          </p>
        )}
        {item.status === 'uploading' && (
          <div className="mt-1.5 flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={t('feedbackPublic.progressAria', { name: item.name })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={item.progress}
              className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-progress-track"
            >
              <div
                className="h-full rounded-[3px] bg-accent transition-[width]"
                style={{ width: `${String(item.progress)}%` }}
              />
            </div>
            <span className="flex-none text-[12px] text-3 tabular-nums">
              {item.progress}% · {size(item.size)}
            </span>
          </div>
        )}
        {item.status === 'error' && item.error && (
          <p role="alert" className="m-0 mt-0.5 text-[12px] leading-[17px] text-danger-soft">
            {size(item.size)} · {errorText(item.error)}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="inline-flex size-9 flex-none items-center justify-center rounded-[8px] text-muted hover:bg-hover"
      >
        <CloseIcon size={16} />
      </button>
    </li>
  );
}

const thumbBase =
  'inline-flex size-11 flex-none items-center justify-center overflow-hidden rounded-[8px]';

function Thumb({ item }: { item: UploadItem }) {
  const [broken, setBroken] = useState(false);
  if (item.kind === 'image' && item.previewUrl && !broken) {
    return (
      <img
        src={item.previewUrl}
        alt=""
        onError={() => {
          setBroken(true);
        }}
        className={cn(thumbBase, 'border border-default object-cover')}
      />
    );
  }
  if (item.kind === 'video') {
    return (
      <span aria-hidden="true" className={cn(thumbBase, 'bg-[var(--fb-video-thumb)] text-white')}>
        <PlayIcon size={18} />
      </span>
    );
  }
  if (item.kind === 'pdf') {
    return (
      <span
        aria-hidden="true"
        className={cn(thumbBase, 'bg-danger-soft text-[10px] font-semibold text-danger-soft')}
      >
        PDF
      </span>
    );
  }
  // Images the browser can't draw (HEIC…) and anything else.
  return (
    <span aria-hidden="true" className={cn(thumbBase, 'border border-default bg-chip text-muted')}>
      <PaperclipIcon size={18} />
    </span>
  );
}
