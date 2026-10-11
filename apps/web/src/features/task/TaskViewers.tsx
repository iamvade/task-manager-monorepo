import { useTranslation } from 'react-i18next';
import { useCurrentWorkspace, useWorkspaceMembers } from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { AvatarStack } from '../../components/ui/AvatarStack';
import { useTaskViewers } from '../../stores/realtime';

/**
 * Not designed: who else has this task open right now (drawer header, before Mark complete).
 * A 24px stack ringed in the surface color, each with the online dot; nothing when it's just me.
 */
export function TaskViewers({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const members = useWorkspaceMembers(useCurrentWorkspace()?.id).data;
  const viewerIds = useTaskViewers(taskId);
  const users = viewerIds
    .filter((id) => id !== me?.user.id)
    .flatMap((id) => {
      const member = members?.find((m) => m.user.id === id);
      return member ? [member.user] : [];
    });
  if (users.length === 0) return null;

  const label = t('drawer.viewers', { names: users.map((u) => u.name).join(', ') });
  return (
    <div title={label} className="flex flex-none items-center">
      <AvatarStack
        users={users}
        size={24}
        max={3}
        ring="surface"
        label={label}
        onlineIds={new Set(users.map((u) => u.id))}
      />
    </div>
  );
}
