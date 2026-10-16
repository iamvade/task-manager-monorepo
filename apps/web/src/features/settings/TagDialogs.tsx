import type { TagWithUsage } from '@kite/shared';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMergeTag } from '../../api/tags';
import { ChevronDownIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Picker } from '../../components/ui/Picker';
import { Popover } from '../../components/ui/Popover';
import { TagChip } from '../../components/ui/TagChip';
import { toast } from '../../stores/toast';

/**
 * Settings → Tags "Merge into…" (not designed): pick the tag to keep; every task carrying `tag`
 * gets it instead and `tag` is deleted. Can't be undone, so it says so and asks to confirm.
 */
export function MergeTagDialog({
  workspaceId,
  tag,
  tags,
  onClose,
}: {
  workspaceId: string;
  /** The tag to merge away; null = closed. */
  tag: TagWithUsage | null;
  tags: readonly TagWithUsage[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  const pickId = useId();
  const merge = useMergeTag(workspaceId);
  const [intoId, setIntoId] = useState<string | null>(null);
  const others = tags.filter((x) => x.id !== tag?.id);
  const into = others.find((x) => x.id === intoId) ?? null;

  const close = () => {
    setIntoId(null);
    onClose();
  };

  return (
    <Modal open={tag !== null} onClose={close} labelledBy={headingId} width={440}>
      <div className="flex flex-col gap-4 p-5">
        <h2 id={headingId} className="m-0 text-[16px] leading-[22px] font-semibold">
          {t('settings.tags.mergeTitle', { name: tag?.name ?? '' })}
        </h2>
        <div className="flex flex-col gap-1.5">
          <span id={pickId} className="text-[13px] font-medium text-2">
            {t('settings.tags.mergeInto')}
          </span>
          <Popover
            label={t('settings.tags.mergeInto')}
            width={300}
            elevation="lg"
            trigger={(props) => (
              <button
                type="button"
                {...props}
                aria-labelledby={pickId}
                aria-describedby={`${pickId}-value`}
                className="flex h-9 w-full items-center gap-2 rounded-[8px] border border-control bg-control px-2.5 text-left text-[13px] hover:bg-hover"
              >
                <span id={`${pickId}-value`} className="flex min-w-0 flex-1 items-center">
                  {into ? (
                    <TagChip name={into.name} color={into.color} />
                  ) : (
                    <span className="text-muted">{t('settings.tags.mergePick')}</span>
                  )}
                </span>
                <ChevronDownIcon size={12} className="flex-none text-icon" />
              </button>
            )}
          >
            {(closePicker) => (
              <Picker<TagWithUsage>
                items={others}
                value={intoId}
                getKey={(x) => x.id}
                getLabel={(x) => x.name}
                label={t('settings.tags.mergeInto')}
                search={{ placeholder: t('settings.tags.search') }}
                onSelect={(x) => {
                  setIntoId(x.id);
                  closePicker();
                }}
                onClose={closePicker}
                renderItem={(x) => (
                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
                    <TagChip name={x.name} color={x.color} />
                    <span className="text-[12px] text-muted tabular-nums">
                      {t('settings.tags.tasks', { count: x.taskCount })}
                    </span>
                  </span>
                )}
              />
            )}
          </Popover>
        </div>
        <p className="m-0 text-[13px] leading-5 text-2">
          {tag && into
            ? t('settings.tags.mergeBody', { from: tag.name, into: into.name })
            : t('settings.tags.mergeHint')}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={merge.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={!tag || !into || merge.isPending}
            aria-busy={merge.isPending}
            onClick={() => {
              if (!tag || !into) return;
              merge.mutate(
                { tagId: tag.id, intoTagId: into.id },
                {
                  onSuccess: () => {
                    toast({
                      message: t('settings.tags.merged', { from: tag.name, into: into.name }),
                    });
                    close();
                  },
                },
              );
            }}
          >
            {t('settings.tags.mergeConfirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
