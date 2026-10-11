import { emailSchema, type WorkspaceMember, type WorkspaceRole } from '@kite/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import {
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  useUpdateMemberRole,
  useWorkspaceMembers,
} from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ChevronDownIcon } from '../../components/icons';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { useDates } from '../../lib/useDates';
import { useOnlineIds } from '../../stores/realtime';
import { toast } from '../../stores/toast';
import { SettingsSection, settingsInput } from './SettingsRow';

type InviteRole = 'member' | 'admin';

interface MembersSectionProps {
  workspaceId: string;
  /** The caller's role here: admins and owners invite and change roles. */
  role: WorkspaceRole;
}

export function MembersSection({ workspaceId, role }: MembersSectionProps) {
  const { t } = useTranslation();
  const isAdmin = role !== 'member';
  return (
    <div className="flex flex-col gap-8">
      {isAdmin ? (
        <InviteForm workspaceId={workspaceId} />
      ) : (
        <p className="m-0 rounded-[8px] bg-subtle px-3 py-2.5 text-[13px] text-3">
          {t('settings.members.adminsOnly')}
        </p>
      )}
      {isAdmin && <PendingInvites workspaceId={workspaceId} />}
      <MemberList workspaceId={workspaceId} canEdit={isAdmin} />
    </div>
  );
}

function InviteForm({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const create = useCreateInvite(workspaceId);
  const emailId = useId();
  const roleId = useId();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<InviteRole>('member');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t('settings.members.invalidEmail'));
      return;
    }
    setError(null);
    create.mutate(
      { email: parsed.data, role: inviteRole },
      {
        onSuccess: (invite) => {
          setEmail('');
          toast({ message: t('settings.members.sent', { email: invite.email }) });
        },
        onError: (err) => {
          setError(
            err instanceof ApiError && err.code === 'ALREADY_MEMBER'
              ? t('settings.members.alreadyMember', { email: parsed.data })
              : t('common.genericError'),
          );
        },
      },
    );
  }

  return (
    <SettingsSection title={t('shell.invite')} description={t('settings.members.inviteHint')}>
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-1.5 border-t border-subtle pt-3.5"
      >
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={emailId} className="sr-only">
            {t('settings.profile.email')}
          </label>
          <input
            id={emailId}
            type="email"
            value={email}
            placeholder="name@company.com"
            autoComplete="off"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${emailId}-error` : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            className={cn(settingsInput, 'flex-[1_1_220px]', error && 'border-danger')}
          />
          <span id={roleId} className="sr-only">
            {t('settings.members.role')}
          </span>
          <SegmentedControl<InviteRole>
            labelledBy={roleId}
            size="md"
            value={inviteRole}
            onChange={setInviteRole}
            options={[
              { value: 'member', label: t('settings.roles.member') },
              { value: 'admin', label: t('settings.roles.admin') },
            ]}
          />
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {t('settings.members.send')}
          </Button>
        </div>
        {error && (
          <p id={`${emailId}-error`} className="m-0 text-[12px] text-danger">
            {error}
          </p>
        )}
      </form>
    </SettingsSection>
  );
}

function PendingInvites({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const invites = useInvites(workspaceId);
  const revoke = useRevokeInvite(workspaceId);
  const dates = useDates();
  if (!invites.data?.length) return null;

  return (
    <SettingsSection title={t('settings.members.pending')}>
      <ul className="m-0 list-none pl-0">
        {invites.data.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-subtle py-2.5"
          >
            <span className="min-w-0 flex-[1_1_200px] truncate text-[13px] text-default">
              {invite.email}
            </span>
            <span className="text-[12px] text-muted">
              {t(`settings.roles.${invite.role}`)} ·{' '}
              {t('settings.members.expires', {
                date: dates.formatDate(invite.expiresAt.slice(0, 10)),
              })}
            </span>
            <Button
              size="sm"
              onClick={() => {
                revoke.mutate(invite.id, {
                  onSuccess: () => {
                    toast({ message: t('settings.members.revoked', { email: invite.email }) });
                  },
                });
              }}
            >
              {t('settings.members.revoke')}
            </Button>
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}

function MemberList({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const members = useWorkspaceMembers(workspaceId);
  const updateRole = useUpdateMemberRole(workspaceId);

  return (
    <SettingsSection
      title={t('settings.members.list')}
      description={
        members.data ? t('settings.members.count', { count: members.data.length }) : undefined
      }
    >
      {!members.data ? (
        <div className="flex flex-col gap-3 border-t border-subtle py-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} height={28} />
          ))}
        </div>
      ) : (
        <ul className="m-0 list-none pl-0">
          {members.data.map((member) => (
            <MemberRow
              key={member.user.id}
              member={member}
              isMe={member.user.id === me?.user.id}
              editable={canEdit && member.role !== 'owner' && member.user.id !== me?.user.id}
              onRole={(role) => {
                updateRole.mutate({ userId: member.user.id, role });
              }}
            />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function MemberRow({
  member,
  isMe,
  editable,
  onRole,
}: {
  member: WorkspaceMember;
  isMe: boolean;
  editable: boolean;
  onRole: (role: InviteRole) => void;
}) {
  const { t } = useTranslation();
  const roleLabel = t(`settings.roles.${member.role}`);
  const online = useOnlineIds().has(member.user.id);
  return (
    <li className="flex items-center gap-3 border-t border-subtle py-2.5">
      <Avatar user={member.user} size={28} title={null} online={online} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-default">
          {member.user.name}
          {isMe && <span className="font-normal text-muted"> {t('settings.members.you')}</span>}
          {online && <span className="sr-only"> · {t('shell.online')}</span>}
        </span>
        <span className="truncate text-[12px] text-muted">
          {member.title ? `${member.title} · ${member.user.email}` : member.user.email}
        </span>
      </div>
      {editable ? (
        <Menu
          label={t('settings.members.changeRole', { name: member.user.name })}
          placement="bottom-end"
          width={180}
          items={(['admin', 'member'] as const).map((role) => ({
            id: role,
            label: t(`settings.roles.${role}`),
            checked: member.role === role,
            onSelect: () => {
              if (role !== member.role) onRole(role);
            },
          }))}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`${t('settings.members.changeRole', { name: member.user.name })}: ${roleLabel}`}
              className="inline-flex h-7 flex-none items-center gap-1.5 rounded-[6px] border-0 bg-transparent px-2 text-[13px] text-2 hover:bg-hover"
            >
              {roleLabel}
              <ChevronDownIcon size={12} className="text-icon" />
            </button>
          )}
        />
      ) : (
        <span className="flex-none px-2 text-[13px] text-muted">{roleLabel}</span>
      )}
    </li>
  );
}
