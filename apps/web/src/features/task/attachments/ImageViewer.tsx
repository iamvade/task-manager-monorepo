import { shortName, type Attachment } from '@kite/shared';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attachmentUrl, downloadAttachment } from '../../../api/attachments';
import { CloseIcon, DownloadIcon, NextIcon, PrevIcon } from '../../../components/icons';
import { Button } from '../../../components/ui/Button';
import { IconButton } from '../../../components/ui/IconButton';
import { Lightbox } from '../../../components/ui/Lightbox';
import { useRelativeTime } from '../../../lib/useRelativeTime';

/** What the viewer needs of an image (task and feedback attachments). */
export interface ViewerImage {
  id: string;
  filename: string;
  size: number;
}

interface ImageViewerProps<T extends ViewerImage> {
  images: T[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  /** Inline URL, download and the "size · uploader" line; default: task attachments. */
  srcOf?: (image: T) => string;
  download?: (image: T) => void;
  meta?: (image: T, size: string) => string;
}

const asAttachment = (image: ViewerImage) => image as Attachment;

// `!`: IconButton's own `bg-transparent` sorts after `bg-surface`.
const floatButton = 'bg-surface! shadow-popover enabled:hover:bg-hover!';

/**
 * Image preview from the Attachments grid (derived: no design draws one). A surface bar on
 * top (name, size · uploader, "2 / 3", Download, Close), the image centered and contained,
 * and ← / → buttons and keys that wrap when the task has more than one image.
 */
export function ImageViewer<T extends ViewerImage>({
  images,
  index,
  onIndexChange,
  onClose,
  srcOf = (image) => attachmentUrl(image.id, { inline: true }),
  download = (image) => {
    downloadAttachment(asAttachment(image));
  },
  meta,
}: ImageViewerProps<T>) {
  const { t } = useTranslation();
  const { size } = useRelativeTime();
  const close = useRef<HTMLButtonElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const image = images[index];
  if (!image) return null;
  const many = images.length > 1;
  const step = (by: number) => {
    onIndexChange((index + by + images.length) % images.length);
  };

  return (
    <Lightbox
      open
      onClose={onClose}
      label={t('drawer.imagePreview', { name: image.filename })}
      initialFocus={close}
      onKeyDown={(event) => {
        if (!many || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowLeft') step(-1);
        else if (event.key === 'ArrowRight') step(1);
        else return;
        event.preventDefault();
      }}
    >
      <div className="flex flex-none justify-center p-4 pb-0">
        <div className="box-border flex w-full max-w-[720px] items-center gap-3 rounded-[10px] border border-default bg-surface px-3 py-2 text-default shadow-popover">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium" title={image.filename}>
              {image.filename}
            </span>
            <span className="text-[12px] text-muted">
              {meta
                ? meta(image, size(image.size))
                : t('drawer.attachmentMeta', {
                    size: size(image.size),
                    name: shortName(asAttachment(image).uploader.name),
                  })}
            </span>
          </span>
          {many && (
            <span className="text-[12px] text-muted tabular-nums">
              {t('drawer.imageCount', { index: index + 1, total: images.length })}
            </span>
          )}
          <IconButton
            label={t('drawer.download')}
            title={t('drawer.download')}
            icon={<DownloadIcon size={16} />}
            onClick={() => {
              download(image);
            }}
          />
          <IconButton
            ref={close}
            label={t('drawer.closePreview')}
            title={t('drawer.closePreview')}
            icon={<CloseIcon size={16} />}
            onClick={onClose}
          />
        </div>
      </div>
      <div
        data-lightbox-backdrop
        className="relative flex min-h-0 flex-1 items-center justify-center gap-4 p-4"
      >
        {many && (
          <IconButton
            label={t('drawer.prevImage')}
            size={36}
            radius={9999}
            icon={<PrevIcon size={18} />}
            className={floatButton}
            onClick={() => {
              step(-1);
            }}
          />
        )}
        <div data-lightbox-backdrop className="flex size-full min-w-0 items-center justify-center">
          {failed === image.id ? (
            <div className="flex max-w-[320px] flex-col items-center gap-3 rounded-[10px] border border-default bg-surface p-5 text-center text-[13px] text-2 shadow-popover">
              <p className="m-0">{t('drawer.previewFailed')}</p>
              <Button
                variant="secondary"
                icon={<DownloadIcon size={14} />}
                onClick={() => {
                  download(image);
                }}
              >
                {t('drawer.download')}
              </Button>
            </div>
          ) : (
            <img
              key={image.id}
              src={srcOf(image)}
              alt={image.filename}
              onError={() => {
                setFailed(image.id);
              }}
              className="max-h-full max-w-full rounded-[10px] object-contain"
            />
          )}
        </div>
        {many && (
          <IconButton
            label={t('drawer.nextImage')}
            size={36}
            radius={9999}
            icon={<NextIcon size={18} />}
            className={floatButton}
            onClick={() => {
              step(1);
            }}
          />
        )}
      </div>
    </Lightbox>
  );
}
