import {
  MAX_CAPACITY_POINTS,
  emailSchema,
  isAway,
  matchesName,
  type UpdateMember,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@kite/shared';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../api/client';
import {
  useAllMembers,
  useCreateInvite,
  useInvites,
  useRevokeInvite,
  useSetMemberActive,
  useUpdateMember,
  useWorkspaceMembers,
} from '../../api/workspaces';
import { useAuth } from '../../auth/useAuth';
import { ChevronDownIcon, MoreIcon } from '../../components/icons';
import { IconButton } from '../../components/ui/IconButton';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { SegmentedControl } from '../../components/ui/SegmentedControl';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { useCopyLink } from '../../lib/useCopyLink';
import { useDates } from '../../lib/useDates';
import { useOnlineIds } from '../../stores/realtime';
import { toast } from '../../stores/toast';
import { AwayDialog, DeactivateDialog } from './MemberDialogs';
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
  /** The link from the last invite: there is no email delivery, so the admin passes it on. */
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);

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
          setCreated({ email: invite.email, link: invite.link });
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
              setCreated(null);
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
      {created && <InviteLink {...created} />}
    </SettingsSection>
  );
}

function InviteLink({ email, link }: { email: string; link: string }) {
  const { t } = useTranslation();
  const linkId = useId();
  const { copied, copy } = useCopyLink();
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-[8px] bg-subtle px-3 py-2.5">
      <label htmlFor={linkId} className="text-[13px] text-2">
        {t('settings.members.linkFor', { email })}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={linkId}
          type="text"
          readOnly
          value={link}
          onFocus={(e) => {
            e.currentTarget.select();
          }}
          className={cn(settingsInput, 'flex-[1_1_220px] font-mono text-[12px]')}
        />
        <Button
          onClick={() => {
            void copy(link);
          }}
        >
          {copied ? t('header.linkCopied') : t('header.copyLink')}
        </Button>
      </div>
      <p className="m-0 text-[12px] text-muted">{t('settings.members.linkOnce')}</p>
    </div>
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

/** The member list gets a search box above this many people. */
const SEARCH_FROM = 8;

function MemberList({ workspaceId, canEdit }: { workspaceId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const { me } = useAuth();
  const members = useWorkspaceMembers(workspaceId);
  const update = useUpdateMember(workspaceId);
  const [deactivating, setDeactivating] = useState<WorkspaceMember | null>(null);
  const [awayFor, setAwayFor] = useState<WorkspaceMember | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim();
  // Name in either script ("Bat" finds Бат-Эрдэнэ), job title or email.
  const shown = (members.data ?? []).filter(
    (m) =>
      !q ||
      matchesName(m.user.name, q) ||
      (m.title?.toLowerCase().includes(q.toLowerCase()) ?? false) ||
      m.user.email.toLowerCase().includes(q.toLowerCase()),
  );

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
        <>
          {members.data.length > SEARCH_FROM && (
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              aria-label={t('settings.members.search')}
              placeholder={t('settings.members.search')}
              className={cn(settingsInput, 'mb-3')}
            />
          )}
          {shown.length === 0 && (
            <p className="m-0 border-t border-subtle py-4 text-[13px] text-muted">
              {t('settings.members.noMatches')}
            </p>
          )}
          <ul className="m-0 list-none pl-0">
            {shown.map((member) => (
              <MemberRow
                key={member.user.id}
                member={member}
                isMe={member.user.id === me?.user.id}
                canEdit={canEdit}
                roleEditable={canEdit && member.role !== 'owner' && member.user.id !== me?.user.id}
                onUpdate={(patch) => {
                  update.mutate({ userId: member.user.id, ...patch });
                }}
                onSetAway={
                  canEdit
                    ? () => {
                        setAwayFor(member);
                      }
                    : undefined
                }
                onDeactivate={
                  canEdit && member.role !== 'owner' && member.user.id !== me?.user.id
                    ? () => {
                        setDeactivating(member);
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}
      <DeactivateDialog
        workspaceId={workspaceId}
        member={deactivating}
        members={members.data ?? []}
        onClose={() => {
          setDeactivating(null);
        }}
      />
      <AwayDialog
        member={awayFor}
        onSave={(value) => {
          if (awayFor) update.mutate({ userId: awayFor.user.id, ...value });
        }}
        onClose={() => {
          setAwayFor(null);
        }}
      />
      {canEdit && <DeactivatedList workspaceId={workspaceId} />}
    </SettingsSection>
  );
}

/** Admins: deactivated members, each with Reactivate (not designed). */
function DeactivatedList({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const all = useAllMembers(workspaceId, true);
  const setActive = useSetMemberActive(workspaceId);
  const gone = (all.data ?? []).filter((m) => m.deactivatedAt !== null);
  if (gone.length === 0) return null;
  return (
    <section aria-labelledby="deactivated-h" className="mt-6 flex flex-col">
      <h3 id="deactivated-h" className="m-0 pb-2 text-[13px] font-semibold text-2">
        {t('members.deactivated.title', { count: gone.length })}
      </h3>
      <ul className="m-0 list-none pl-0">
        {gone.map((m) => (
          <li key={m.user.id} className="flex items-center gap-3 border-t border-subtle py-2.5">
            <Avatar user={m.user} size={28} title={null} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-2">{m.user.name}</span>
              <span className="truncate text-[12px] text-muted">{m.user.email}</span>
            </div>
            <Button
              size="sm"
              disabled={setActive.isPending}
              onClick={() => {
                setActive.mutate(
                  { userId: m.user.id, active: true },
                  {
                    onSuccess: () => {
                      toast({ message: t('members.deactivated.back', { name: m.user.name }) });
                    },
                  },
                );
              }}
            >
              {t('members.deactivated.reactivate')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemberRow({
  member,
  isMe,
  canEdit,
  roleEditable,
  onUpdate,
  onSetAway,
  onDeactivate,
}: {
  member: WorkspaceMember;
  isMe: boolean;
  /** Admins edit job titles and capacity of everyone, themselves included. */
  canEdit: boolean;
  roleEditable: boolean;
  onUpdate: (patch: UpdateMember) => void;
  /** Admins: "Set away…" / "Deactivate…" in the row menu (not for the owner or yourself). */
  onSetAway?: () => void;
  onDeactivate?: () => void;
}) {
  const { t } = useTranslation();
  const dates = useDates();
  const away = isAway(member, dates.today);
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
          {away && member.awayUntil && (
            <span
              className="ml-2 inline-flex h-5 items-center rounded-[10px] bg-chip px-2 text-[11px] font-medium text-2"
              title={member.awayNote ?? undefined}
            >
              {t('members.away.badge', { date: dates.formatDate(member.awayUntil) })}
            </span>
          )}
        </span>
        {canEdit ? (
          <span className="flex min-w-0 items-center gap-1 text-[12px] text-muted">
            <TitleInput
              value={member.title}
              label={t('settings.members.jobTitleOf', { name: member.user.name })}
              onSave={(title) => {
                onUpdate({ title });
              }}
            />
            <span className="truncate">· {member.user.email}</span>
          </span>
        ) : (
          <span className="truncate text-[12px] text-muted">
            {member.title ? `${member.title} · ${member.user.email}` : member.user.email}
          </span>
        )}
      </div>
      {canEdit ? (
        <CapacityInput
          value={member.capacityPoints}
          label={t('settings.members.capacityOf', { name: member.user.name })}
          onSave={(capacityPoints) => {
            onUpdate({ capacityPoints });
          }}
        />
      ) : (
        <span
          className="flex-none text-[12px] text-muted tabular-nums"
          title={t('settings.members.capacityHint')}
        >
          {member.capacityPoints} {t('settings.members.capacityUnit')}
        </span>
      )}
      {roleEditable ? (
        <Menu
          label={t('settings.members.changeRole', { name: member.user.name })}
          placement="bottom-end"
          width={180}
          items={(['admin', 'member'] as const).map((role) => ({
            id: role,
            label: t(`settings.roles.${role}`),
            checked: member.role === role,
            onSelect: () => {
              if (role !== member.role) onUpdate({ role });
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
      {(onSetAway ?? onDeactivate) && (
        <Menu
          label={t('members.actions', { name: member.user.name })}
          placement="bottom-end"
          width={200}
          items={[
            ...(onSetAway
              ? [{ id: 'away', label: t('members.away.set'), onSelect: onSetAway }]
              : []),
            ...(onDeactivate
              ? [
                  { type: 'separator' as const, id: 'sep' },
                  {
                    id: 'deactivate',
                    label: t('members.deactivate.action'),
                    danger: true,
                    onSelect: onDeactivate,
                  },
                ]
              : []),
          ]}
          trigger={(props) => (
            <IconButton
              {...props}
              label={t('members.actions', { name: member.user.name })}
              size={28}
              icon={<MoreIcon size={14} className="text-icon" />}
            />
          )}
        />
      )}
    </li>
  );
}

/** Inline job title (saved on blur or Enter; Esc reverts; blank clears). */
function TitleInput({
  value,
  label,
  onSave,
}: {
  value: string | null;
  label: string;
  onSave: (title: string | null) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value ?? '';
  const placeholder = t('settings.members.jobTitlePlaceholder');
  const save = () => {
    if (draft === null) return;
    const next = draft.trim() || null;
    setDraft(null);
    if (next !== value) onSave(next);
  };
  return (
    <input
      type="text"
      value={shown}
      maxLength={60}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
        }
      }}
      size={Math.max(shown.length, placeholder.length, 4)}
      className="-mx-1 h-5 max-w-[200px] min-w-0 rounded-[4px] border-0 bg-transparent px-1 text-[12px] text-muted outline-none placeholder:text-faint hover:bg-hover focus-visible:bg-control focus-visible:text-default focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
    />
  );
}

/** Capacity points for the next 2 weeks (0–100), saved on blur or Enter; Esc reverts. */
function CapacityInput({
  value,
  label,
  onSave,
}: {
  value: number;
  label: string;
  onSave: (points: number) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const save = () => {
    if (draft === null) return;
    const points = Number(draft);
    setDraft(null);
    const valid = draft !== '' && Number.isInteger(points) && points >= 0;
    if (valid && points <= MAX_CAPACITY_POINTS && points !== value) onSave(points);
  };
  return (
    <span
      className="flex flex-none items-center gap-1.5 text-[12px] text-muted"
      title={t('settings.members.capacityHint')}
    >
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_CAPACITY_POINTS}
        step={1}
        value={draft ?? String(value)}
        aria-label={label}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(null);
          }
        }}
        className="box-border h-7 w-14 rounded-[8px] border border-control bg-control px-2 text-right text-[13px] text-default tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink"
      />
      <span aria-hidden="true">{t('settings.members.capacityUnit')}</span>
    </span>
  );
}
