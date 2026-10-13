import { useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: string;
  /** The confirming button's text ("Delete"). */
  confirmLabel: string;
  /** `danger` paints the confirming button red (deletes that can't be undone). */
  tone?: 'danger' | 'default';
  /** Disables both buttons while the action runs. */
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * A small modal asking a yes/no question (replaces `window.confirm`, not designed): title,
 * optional body, Cancel and the action. Focus starts on Cancel so Enter and Esc both back out
 * of a destructive action; Tab reaches the confirming button.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  tone = 'default',
  pending = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={headingId}
      width={400}
      initialFocus={cancelRef}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
            {title}
          </h2>
          {body && <p className="m-0 text-[13px] leading-5 text-2">{body}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} disabled={pending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            disabled={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
