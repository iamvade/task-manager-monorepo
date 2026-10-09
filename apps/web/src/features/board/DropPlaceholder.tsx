import { useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';

export const PLACEHOLDER_ID = 'board:placeholder';

/** "Drop to move to In Review" (Board.dc.html): 116px, 2px dashed accent on accent-soft. */
export function DropPlaceholder({ status }: { status: string }) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: PLACEHOLDER_ID });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className="box-border flex h-[116px] flex-none items-center justify-center rounded-[10px] border-2 border-dashed border-accent bg-accent-soft text-[12px] font-medium text-accent-ink"
    >
      {t('board.dropToMove', { status })}
    </div>
  );
}
