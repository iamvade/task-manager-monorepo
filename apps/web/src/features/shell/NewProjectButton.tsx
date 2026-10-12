import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCreateProject } from '../../api/projects';
import { PlusIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Popover } from '../../components/ui/Popover';
import { cn } from '../../lib/cn';
import { useUiStore } from '../../stores/ui';

interface NewProjectButtonProps {
  workspaceId: string;
  space: { id: string; name: string };
}

/**
 * "+" on a space row (shown on hover / focus): a small popover form (not designed) that creates a
 * project in that space. The server picks its key, color and default statuses; the new project
 * opens on its empty state (templates).
 */
export function NewProjectButton({ workspaceId, space }: NewProjectButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSpaceOpen = useUiStore((s) => s.setSpaceOpen);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const createProject = useCreateProject(workspaceId);
  const label = t('shell.newProjectIn', { space: space.name });

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createProject.mutate(
      { spaceId: space.id, name: trimmed },
      {
        onSuccess: (project) => {
          setName('');
          setOpen(false);
          setSpaceOpen(space.id, true);
          void navigate(`/p/${project.id}/list`);
        },
      },
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={label}
      width={256}
      elevation="lg"
      trigger={(props) => (
        <IconButton
          {...props}
          label={label}
          size={24}
          className={cn(
            'mr-1 flex-none text-muted group-focus-within:opacity-100 group-hover:opacity-100',
            open ? 'opacity-100' : 'opacity-0',
          )}
          icon={<PlusIcon size={14} />}
        />
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-2 p-2">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted">
          {t('shell.projectName')}
          <input
            value={name}
            maxLength={80}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className="h-8 rounded-[8px] border border-control bg-control px-2 text-[13px] font-normal text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
          />
        </label>
        {createProject.isError && (
          <p role="alert" className="m-0 text-[12px] text-danger">
            {t('common.genericError')}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || createProject.isPending}
          className="self-end"
        >
          {t('shell.createProject')}
        </Button>
      </form>
    </Popover>
  );
}
