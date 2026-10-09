import { shortName, type Attachment } from '@kite/shared';
import { useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { attachmentUrl, useDeleteAttachment, usePendingUploads } from '../../../api/attachments';
import {
  DownloadIcon,
  MoreIcon,
  PaperclipIcon,
  TrashIcon,
  UploadIcon,
} from '../../../components/icons';
import { IconButton } from '../../../components/ui/IconButton';
import { Menu } from '../../../components/ui/Menu';
import { cn } from '../../../lib/cn';
import { useRelativeTime } from '../../../lib/useRelativeTime';
import { canModerate, useTaskView } from '../TaskContext';

const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const extension = (filename: string) => {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1, dot + 5).toUpperCase() : 'FILE';
};

/** The design's placeholder art, shown until (or instead of) the image preview. */
function PreviewArt() {
  return (
    <span className="box-border flex h-[72px] w-10 flex-col gap-1 rounded-[6px] border border-default bg-surface p-1.5">
      <span className="h-1 rounded-[2px] bg-[var(--border-strong)]" />
      <span className="h-3 rounded-[2px] bg-[var(--border)]" />
      <span className="h-1 rounded-[2px] bg-[var(--border)]" />
      <span className="mt-auto h-2 rounded-[2px] bg-accent" />
    </span>
  );
}

function ImagePreview({ attachment }: { attachment: Attachment }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      aria-hidden="true"
      className="flex h-[88px] items-center justify-center overflow-hidden bg-surface-2"
    >
      {failed ? (
        <PreviewArt />
      ) : (
        <img
          src={attachmentUrl(attachment.id, { inline: true })}
          alt=""
          loading="lazy"
          onError={() => {
            setFailed(true);
          }}
          className="size-full object-cover"
        />
      )}
    </span>
  );
}

function TypeBadge({ filename }: { filename: string }) {
  const ext = extension(filename);
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-9 flex-none items-center justify-center rounded-[8px] text-[10px] font-semibold',
        ext === 'PDF' ? 'bg-danger-soft text-danger-soft' : 'bg-chip text-chip',
      )}
    >
      {ext}
    </span>
  );
}

function AttachmentCard({ attachment }: { attachment: Attachment }) {
  const { t } = useTranslation();
  const { task, me, role } = useTaskView();
  const { size } = useRelativeTime();
  const remove = useDeleteAttachment();
  const image = PREVIEWABLE.has(attachment.mime);
  const canDelete = attachment.uploader.id === me.id || canModerate(role);
  const href = attachmentUrl(attachment.id);
  const meta = t('drawer.attachmentMeta', {
    size: size(attachment.size),
    name: shortName(attachment.uploader.name),
  });

  const name = (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-[13px] font-medium">{attachment.filename}</span>
      <span className="text-[12px] text-muted">{meta}</span>
    </span>
  );

  return (
    <div className="group/att relative min-w-0">
      <a
        href={href}
        download={attachment.filename}
        title={attachment.filename}
        className={cn(
          'flex overflow-hidden rounded-[10px] border border-default text-default hover:border-strong',
          image ? 'flex-col' : 'items-center gap-2.5 p-2.5',
        )}
      >
        {image ? (
          <>
            <ImagePreview attachment={attachment} />
            <span className="px-2.5 py-2">{name}</span>
          </>
        ) : (
          <>
            <TypeBadge filename={attachment.filename} />
            {name}
          </>
        )}
      </a>
      <div className="absolute top-1.5 right-1.5 opacity-0 group-focus-within/att:opacity-100 group-hover/att:opacity-100 has-[[aria-expanded=true]]:opacity-100">
        <Menu
          label={t('drawer.attachmentOptions', { name: attachment.filename })}
          placement="bottom-end"
          width={180}
          items={[
            {
              id: 'download',
              label: t('drawer.download'),
              icon: <DownloadIcon size={14} />,
              onSelect: () => {
                const link = document.createElement('a');
                link.href = href;
                link.download = attachment.filename;
                link.click();
              },
            },
            ...(canDelete
              ? [
                  {
                    id: 'delete',
                    label: t('table.delete'),
                    icon: <TrashIcon size={14} />,
                    danger: true,
                    onSelect: () => {
                      remove.mutate({ taskId: task.id, attachment });
                    },
                  },
                ]
              : []),
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label={t('drawer.attachmentOptions', { name: attachment.filename })}
              size={24}
              icon={<MoreIcon size={14} />}
              className="bg-surface shadow-segment"
            />
          )}
        />
      </div>
    </div>
  );
}

function PendingCard({ file }: { file: File }) {
  const { t } = useTranslation();
  return (
    <div
      aria-busy="true"
      className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-default p-2.5 opacity-70"
    >
      <TypeBadge filename={file.name} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[13px] font-medium">{file.name}</span>
        <span className="text-[12px] text-muted">{t('drawer.uploading')}</span>
      </span>
    </div>
  );
}

/**
 * Attachments (TaskDetail.dc.html): "Attachments 3" + Attach, a 2-column grid of image cards
 * (88px preview) and file cards (36px type badge), then the dashed "Drop files or browse" cell.
 * Cards download on click; the "…" menu has Download / Delete.
 */
export function AttachmentSection() {
  const { t } = useTranslation();
  const { task, upload } = useTaskView();
  const pending = usePendingUploads(task.id);
  const input = useRef<HTMLInputElement>(null);
  const browse = () => input.current?.click();

  return (
    <section aria-labelledby="att-h" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 id="att-h" className="m-0 text-[13px] font-semibold text-2">
          {t('drawer.attachments')}{' '}
          {task.attachments.length > 0 && (
            <span className="font-normal text-muted">{task.attachments.length}</span>
          )}
        </h3>
        <button
          type="button"
          onClick={browse}
          className="flex h-7 items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[12px] font-medium text-2 hover:bg-hover"
        >
          <PaperclipIcon size={14} />
          {t('drawer.attach')}
        </button>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(e) => {
          if (e.target.files) upload(Array.from(e.target.files));
          e.target.value = '';
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        {task.attachments.map((attachment) => (
          <AttachmentCard key={attachment.id} attachment={attachment} />
        ))}
        {pending.map((file, i) => (
          <PendingCard key={`${file.name}-${i}`} file={file} />
        ))}
        <button
          type="button"
          onClick={browse}
          className="flex min-h-[58px] items-center justify-center gap-2 rounded-[10px] border border-dashed border-strong bg-transparent p-2.5 text-[13px] text-muted hover:bg-subtle"
        >
          <UploadIcon size={16} />
          <span>
            <Trans i18nKey="drawer.dropFiles" components={{ browse: <span /> }} />
          </span>
        </button>
      </div>
    </section>
  );
}
