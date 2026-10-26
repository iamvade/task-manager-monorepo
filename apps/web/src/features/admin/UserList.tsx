import type { AdminUser } from '@kite/shared';
import { Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminUsers, useCreatePasswordReset } from '../../api/admin';
import { ErrorState } from '../../components/ErrorState';
import { InviteLink } from '../../components/InviteLink';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { useDates } from '../../lib/useDates';
import { SettingsSection, settingsInput } from '../settings/SettingsRow';

/**
 * `/admin` Users: find anyone by name or email and make them a one-time password reset link
 * (there is no email delivery, so the admin passes it on). Platform admins aren't listed.
 */
export function UserList() {
  const { t } = useTranslation();
  const searchId = useId();
  const [query, setQuery] = useState('');
  const users = useAdminUsers(query);

  return (
    <SettingsSection title={t('admin.users')} description={t('admin.usersHint')}>
      <div className="border-t border-subtle pt-3.5 pb-1">
        <label htmlFor={searchId} className="sr-only">
          {t('admin.searchUsers')}
        </label>
        <div className="relative">
          <Search
            aria-hidden
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
          />
          <input
            id={searchId}
            type="search"
            value={query}
            placeholder={t('admin.searchUsers')}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            className={cn(settingsInput, 'w-full pl-8')}
          />
        </div>
      </div>
      {users.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2 pt-2">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : users.isError ? (
        <ErrorState error={users.error} />
      ) : users.data.length === 0 ? (
        <p className="m-0 pt-3 text-[13px] text-muted">{t('admin.noUsers')}</p>
      ) : (
        <ul className="m-0 list-none pl-0" aria-busy={users.isPlaceholderData || undefined}>
          {users.data.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  const dates = useDates();
  const reset = useCreatePasswordReset();
  const nameId = useId();
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);

  const workspaces =
    user.workspaces.length > 0
      ? user.workspaces.map((w) => w.name).join(', ')
      : t('admin.noWorkspace');

  return (
    <li className="flex flex-col gap-2 border-t border-subtle py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2.5">
          <Avatar user={user} size={28} title={null} />
          <div className="flex min-w-0 flex-col">
            <span id={nameId} className="truncate text-[13px] font-medium">
              {user.name}
            </span>
            <span className="truncate text-[12px] text-muted">{user.email}</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-[1_1_200px] flex-col text-[12px]">
          <span className="truncate text-2">{workspaces}</span>
          {user.pendingReset && !created && (
            <span className="text-muted">
              {t('admin.resetPending', {
                date: dates.formatDate(user.pendingReset.expiresAt.slice(0, 10)),
              })}
            </span>
          )}
        </div>
        <Button
          size="sm"
          disabled={reset.isPending}
          aria-describedby={nameId}
          onClick={() => {
            reset.mutate(user.id, {
              onSuccess: (result) => {
                setCreated({ email: result.email, link: result.link });
              },
            });
          }}
        >
          {user.pendingReset || created ? t('admin.newResetLink') : t('admin.resetPassword')}
        </Button>
      </div>
      {created && (
        <InviteLink
          {...created}
          label={t('admin.resetLinkFor', { email: created.email })}
          note={t('admin.resetLinkOnce')}
        />
      )}
    </li>
  );
}
