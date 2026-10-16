import { canCreateStandupGroup } from '@kite/shared';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams } from 'react-router';
import { useCreateStandupGroup, useStandupGroup, useStandupGroups } from '../../api/standups';
import { useCurrentWorkspace } from '../../api/workspaces';
import { ErrorState } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useUiStore } from '../../stores/ui';
import { StandupDayView, WriteOverEmpty } from './day/StandupDayView';
import { StandupEmptyView } from './StandupEmptyView';
import { useWorkspaceRole } from './useStandup';

function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 px-6 py-5">
      <Skeleton width={180} height={36} />
      <Skeleton height={14} />
      <Skeleton width="60%" height={14} />
    </div>
  );
}

/** `/standup`: my last group, else my first, else the first; no groups → create / ask. */
export function StandupIndexPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const groups = useStandupGroups(workspace?.id);
  const lastId = useUiStore((s) => s.lastStandupGroupId);
  const role = useWorkspaceRole();
  if (groups.isPending) return <Loading />;
  if (groups.isError) return <ErrorState error={groups.error} />;
  const list = groups.data;
  const target = list.find((g) => g.id === lastId) ?? list.find((g) => g.isMember) ?? list[0];
  if (target) return <Navigate to={`/standup/${target.id}`} replace />;
  const admin = role !== undefined && canCreateStandupGroup(role);
  return (
    <EmptyState
      as="h1"
      title={t('standup.empty.noGroupsTitle')}
      body={t('standup.empty.noGroupsBody')}
      footer={admin ? undefined : t('standup.empty.noGroupsMember')}
      actions={admin && workspace ? <CreateFirstGroup workspaceId={workspace.id} /> : undefined}
    />
  );
}

/** Admins with no groups yet: name + "Create a standup group" (then its settings). */
function CreateFirstGroup({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const create = useCreateStandupGroup(workspaceId);
  return (
    <form
      className="flex flex-wrap items-center justify-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        create.mutate(
          { name: trimmed },
          { onSuccess: (group) => void navigate(`/standup/${group.id}/settings`) },
        );
      }}
    >
      <input
        aria-label={t('shell.standupGroupName')}
        placeholder={t('shell.standupGroupName')}
        value={name}
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className="box-border h-10 w-[220px] rounded-[8px] border border-control bg-control px-3 text-[14px] text-default outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
      />
      <Button type="submit" variant="primary" size="lg" disabled={!name.trim() || create.isPending}>
        {t('standup.empty.noGroupsTitle')}
      </Button>
    </form>
  );
}

/** `/standup/:groupId/:date?`: the empty state until someone posts, then the group page. */
export function StandupGroupPage() {
  const { groupId, date } = useParams();
  const workspace = useCurrentWorkspace();
  const group = useStandupGroup(groupId);
  const groups = useStandupGroups(workspace?.id);
  const setLast = useUiStore((s) => s.setLastStandupGroup);
  const loaded = group.data;
  useEffect(() => {
    if (loaded && !loaded.archivedAt) setLast(loaded.id);
  }, [loaded, setLast]);

  if (group.isPending) return <Loading />;
  if (group.isError) return <ErrorState error={group.error} />;
  if (!group.data.hasPosts && date === undefined) {
    return (
      <>
        <StandupEmptyView group={group.data} groups={groups.data ?? []} />
        <WriteOverEmpty group={group.data} />
      </>
    );
  }
  return <StandupDayView group={group.data} groups={groups.data ?? []} date={date} />;
}
