import { canCreateStandupGroup } from '@kite/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router';
import { useCreateStandupGroup, useStandupGroups } from '../../api/standups';
import { useCurrentWorkspace } from '../../api/workspaces';
import { PlusIcon, StandupIcon } from '../../components/icons';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Popover } from '../../components/ui/Popover';
import { cn } from '../../lib/cn';
import { NavItem } from '../shell/NavItem';
import { useWorkspaceRole, waitingForMe } from './useStandup';

/**
 * "Standup" nav item (Standup.dc.html): chat icon, 8px accent dot while I haven't posted today
 * in a group that meets today.
 */
export function StandupNavItem() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const groups = useStandupGroups(workspace?.id);
  const waiting = waitingForMe(groups.data).length > 0;
  return (
    <NavItem
      to="/standup"
      icon={<StandupIcon size={16} />}
      label={t('shell.standup')}
      trailing={
        waiting ? (
          <span
            role="img"
            aria-label={t('shell.notPostedToday')}
            className="size-2 flex-none rounded-full bg-accent"
          />
        ) : null
      }
    />
  );
}

/**
 * "Standup groups" sidebar section: my groups as 30px rows with a 6px dot (accent when active);
 * the active row is the neutral selected style. Admins get a "+" (name-only popover).
 */
export function StandupGroupsSection() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const groups = useStandupGroups(workspace?.id);
  const role = useWorkspaceRole();
  const mine = (groups.data ?? []).filter((g) => g.isMember);
  const canCreate = role !== undefined && canCreateStandupGroup(role);
  if (!workspace || (mine.length === 0 && !canCreate)) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center justify-between pr-1 pl-3">
        <span className="text-[12px] font-medium text-muted">{t('shell.standupGroups')}</span>
        {canCreate && <NewStandupGroupButton workspaceId={workspace.id} />}
      </div>
      {mine.map((g) => (
        <NavLink
          key={g.id}
          to={`/standup/${g.id}`}
          className={({ isActive }) =>
            cn(
              'group/nav flex h-[30px] items-center gap-2 rounded-[8px] px-3 text-[13px]',
              isActive ? 'bg-nav-hover font-medium text-default' : 'text-2 hover:bg-nav-hover',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'size-1.5 flex-none rounded-full',
                  isActive ? 'bg-accent' : 'bg-[var(--project-dot-inactive)]',
                )}
              />
              <span className="truncate">{g.name}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

/** "+" next to "Standup groups" (admins): a name-only popover like New space. */
function NewStandupGroupButton({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useCreateStandupGroup(workspaceId);

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    create.mutate(
      { name: trimmed },
      {
        onSuccess: (group) => {
          setName('');
          setOpen(false);
          void navigate(`/standup/${group.id}/settings`);
        },
      },
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={t('shell.newStandupGroup')}
      width={256}
      elevation="lg"
      trigger={(props) => (
        <IconButton
          {...props}
          label={t('shell.newStandupGroup')}
          size={24}
          className="text-muted"
          icon={<PlusIcon size={14} />}
        />
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-2 p-2">
        <label className="flex flex-col gap-1.5 text-[12px] font-medium text-muted">
          {t('shell.standupGroupName')}
          <input
            value={name}
            maxLength={60}
            onChange={(e) => {
              setName(e.target.value);
            }}
            className="h-8 rounded-[8px] border border-control bg-control px-2 text-[13px] font-normal text-default outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
          />
        </label>
        {create.isError && (
          <p role="alert" className="m-0 text-[12px] text-danger">
            {t('common.genericError')}
          </p>
        )}
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || create.isPending}
          className="self-end"
        >
          {t('shell.createStandupGroup')}
        </Button>
      </form>
    </Popover>
  );
}
