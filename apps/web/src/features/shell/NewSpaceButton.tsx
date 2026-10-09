import { PALETTE_KEYS, type PaletteKey } from '@kite/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateSpace } from '../../api/spaces';
import { PlusIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Popover } from '../../components/ui/Popover';

// Space badge colors drawn in the designs first, then the rest of the palette.
const SPACE_COLORS: readonly PaletteKey[] = [
  'violet',
  'green',
  'rose',
  'sky',
  ...PALETTE_KEYS.filter((k) => !['violet', 'green', 'rose', 'sky', 'neutral'].includes(k)),
];

interface NewSpaceButtonProps {
  workspaceId: string;
  spaceCount: number;
}

/** "+" next to "Spaces": a small popover form (not designed) that creates a space. */
export function NewSpaceButton({ workspaceId, spaceCount }: NewSpaceButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createSpace = useCreateSpace(workspaceId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = SPACE_COLORS[spaceCount % SPACE_COLORS.length] ?? 'violet';
    createSpace.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => {
          setName('');
          setOpen(false);
        },
      },
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('shell.newSpace')}
      width={256}
      elevation="lg"
      trigger={(props) => (
        <IconButton
          {...props}
          label={t('shell.newSpace')}
          size={24}
          className="text-muted"
          icon={<PlusIcon size={14} />}
        />
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-2 p-2">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted">
          {t('shell.spaceName')}
          <input
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className="h-8 rounded-[8px] border border-control bg-control px-2 text-[13px] font-normal text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
          />
        </label>
        {createSpace.isError && (
          <p role="alert" className="m-0 text-[12px] text-danger">
            {t('common.genericError')}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || createSpace.isPending}
          className="self-end"
        >
          {t('shell.createSpace')}
        </Button>
      </form>
    </Popover>
  );
}
