import {
  emailSchema,
  nameSchema,
  workspaceSlug,
  workspaceSlugSchema,
  type AdminWorkspace,
} from '@kite/shared';
import { useEffect, useId, useState, type FormEvent, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminWorkspaces, useCreateWorkspace, useReissueOwnerInvite } from '../../api/admin';
import { useLogout } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../auth/useAuth';
import { ErrorState } from '../../components/ErrorState';
import { InviteLink } from '../../components/InviteLink';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { useDates } from '../../lib/useDates';
import { toast } from '../../stores/toast';
import { SettingsSection, settingsInput } from '../settings/SettingsRow';

type Field = 'name' | 'slug' | 'ownerEmail';

/**
 * `/admin`: the platform admin's console (role vade, no workspace of their own). Not in the
 * designs; built from the Settings → Members pieces: create a workspace with its owner invite,
 * list every workspace with its owner or pending invite, re-issue the owner link.
 */
export function AdminPage() {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t('admin.title')} · Kite`;
  }, [t]);

  return (
    <div className="flex min-h-screen flex-col bg-default text-default">
      <AdminHeader />
      <main id="main" className="mx-auto flex w-full max-w-[760px] flex-col gap-8 px-4 pt-8 pb-16">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[24px] leading-8 font-semibold tracking-[-0.01em]">
            {t('admin.title')}
          </h1>
          <p className="m-0 text-[13px] text-muted">{t('admin.subtitle')}</p>
        </div>
        <CreateWorkspaceForm />
        <WorkspaceList />
      </main>
    </div>
  );
}

function AdminHeader() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const logout = useLogout();
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-subtle px-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-[6px] bg-accent text-[13px] font-semibold text-white"
        >
          K
        </span>
        <span className="text-[14px] font-semibold">Kite</span>
        <span className="rounded-[6px] bg-subtle px-1.5 py-0.5 text-[12px] font-medium text-2">
          {t('admin.badge')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {me && (
          <span className="hidden truncate text-[13px] text-muted sm:inline">{me.user.email}</span>
        )}
        <LanguageSwitcher />
        <Button
          size="sm"
          onClick={() => {
            logout.mutate();
          }}
          disabled={logout.isPending}
        >
          {t('auth.signOut')}
        </Button>
      </div>
    </header>
  );
}

function CreateWorkspaceForm() {
  const { t } = useTranslation();
  const create = useCreateWorkspace();
  const ids = { name: useId(), slug: useId(), ownerEmail: useId() };
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  /** The slug follows the name until it is edited by hand. */
  const [slugEdited, setSlugEdited] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field | 'form', string>>>({});
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);
  const origin = window.location.origin;

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsedName = nameSchema.safeParse(name);
    const parsedSlug = workspaceSlugSchema.safeParse(slug);
    const parsedEmail = emailSchema.safeParse(ownerEmail);
    const next: typeof errors = {};
    if (!parsedName.success) next.name = t('admin.invalidName');
    if (!parsedSlug.success) next.slug = t('admin.invalidSlug');
    if (!parsedEmail.success) next.ownerEmail = t('settings.members.invalidEmail');
    setErrors(next);
    if (!parsedName.success || !parsedSlug.success || !parsedEmail.success) return;
    create.mutate(
      { name: parsedName.data, slug: parsedSlug.data, ownerEmail: parsedEmail.data },
      {
        onSuccess: ({ workspace, invite }) => {
          setName('');
          setSlug('');
          setSlugEdited(false);
          setOwnerEmail('');
          setCreated({ email: invite.email, link: invite.link });
          toast({ message: t('admin.created', { name: workspace.name }) });
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : undefined;
          if (code === 'SLUG_TAKEN') setErrors({ slug: t('admin.slugTaken') });
          else if (code === 'INVALID_OWNER') setErrors({ ownerEmail: t('admin.invalidOwner') });
          else setErrors({ form: t('common.genericError') });
        },
      },
    );
  }

  const clear = (field: Field) => {
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));
    setCreated(null);
  };

  const field = (
    id: string,
    key: Field,
    label: string,
    input: InputHTMLAttributes<HTMLInputElement>,
    hint?: string,
  ) => {
    const error = errors[key];
    const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ');
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-2">
          {label}
        </label>
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(settingsInput, 'w-full', error && 'border-danger')}
          {...input}
        />
        {hint && !error && (
          <p id={`${id}-hint`} className="m-0 text-[12px] break-all text-muted">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${id}-error`} className="m-0 text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <SettingsSection title={t('admin.newWorkspace')} description={t('admin.newWorkspaceHint')}>
      <form
        onSubmit={submit}
        noValidate
        className="flex flex-col gap-3 border-t border-subtle pt-3.5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {field(ids.name, 'name', t('admin.name'), {
            type: 'text',
            value: name,
            autoComplete: 'off',
            onChange: (e) => {
              setName(e.target.value);
              if (!slugEdited) setSlug(e.target.value.trim() ? workspaceSlug(e.target.value) : '');
              clear('name');
            },
          })}
          {field(
            ids.slug,
            'slug',
            t('admin.slug'),
            {
              type: 'text',
              value: slug,
              autoComplete: 'off',
              spellCheck: false,
              onChange: (e) => {
                setSlug(e.target.value);
                setSlugEdited(true);
                clear('slug');
              },
            },
            t('admin.slugHint', { url: `${origin}/feedback/${slug || '…'}` }),
          )}
        </div>
        {field(ids.ownerEmail, 'ownerEmail', t('admin.ownerEmail'), {
          type: 'email',
          value: ownerEmail,
          placeholder: 'name@company.com',
          autoComplete: 'off',
          onChange: (e) => {
            setOwnerEmail(e.target.value);
            clear('ownerEmail');
          },
        })}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? t('admin.creating') : t('admin.create')}
          </Button>
          {errors.form && (
            <p role="alert" className="m-0 text-[12px] text-danger">
              {errors.form}
            </p>
          )}
        </div>
      </form>
      {created && <InviteLink {...created} />}
    </SettingsSection>
  );
}

function WorkspaceList() {
  const { t } = useTranslation();
  const workspaces = useAdminWorkspaces();

  return (
    <SettingsSection title={t('admin.list')}>
      {workspaces.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2 border-t border-subtle pt-3">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : workspaces.isError ? (
        <ErrorState error={workspaces.error} />
      ) : workspaces.data.length === 0 ? (
        <p className="m-0 border-t border-subtle pt-3 text-[13px] text-muted">{t('admin.empty')}</p>
      ) : (
        <ul className="m-0 list-none pl-0">
          {workspaces.data.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} />
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

function WorkspaceRow({ workspace }: { workspace: AdminWorkspace }) {
  const { t } = useTranslation();
  const dates = useDates();
  const reissue = useReissueOwnerInvite();
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(workspace.ownerInvite?.email ?? '');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; link: string } | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(t('settings.members.invalidEmail'));
      return;
    }
    reissue.mutate(
      { workspaceId: workspace.id, email: parsed.data },
      {
        onSuccess: (invite) => {
          setOpen(false);
          setCreated({ email: invite.email, link: invite.link });
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : undefined;
          setError(
            code === 'OWNER_EXISTS'
              ? t('admin.ownerExists')
              : code === 'INVALID_OWNER'
                ? t('admin.invalidOwner')
                : t('common.genericError'),
          );
        },
      },
    );
  }

  const status = workspace.owner
    ? t('admin.owner', { name: workspace.owner.name, email: workspace.owner.email })
    : workspace.ownerInvite
      ? t('admin.pending', {
          email: workspace.ownerInvite.email,
          date: dates.formatDate(workspace.ownerInvite.expiresAt.slice(0, 10)),
        })
      : t('admin.noOwner');

  return (
    <li className="flex flex-col gap-2 border-t border-subtle py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex min-w-0 flex-[1_1_220px] flex-col">
          <span className="truncate text-[13px] font-medium">{workspace.name}</span>
          <span className="truncate text-[12px] text-muted">
            {workspace.slug} · {t('admin.members', { count: workspace.memberCount })}
          </span>
        </div>
        <span className="min-w-0 flex-[1_1_240px] text-[12px] text-2">{status}</span>
        {!workspace.owner && !open && (
          <Button
            size="sm"
            onClick={() => {
              setOpen(true);
              setCreated(null);
              setError(null);
            }}
          >
            {t('admin.newLink')}
          </Button>
        )}
      </div>
      {open && (
        <form onSubmit={submit} noValidate className="flex flex-col gap-1.5">
          <label htmlFor={emailId} className="text-[12px] text-muted">
            {t('admin.newLinkHint', { name: workspace.name })}
          </label>
          <div className="flex flex-wrap items-center gap-2">
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
            <Button type="submit" size="sm" variant="primary" disabled={reissue.isPending}>
              {t('admin.sendLink')}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {error && (
            <p id={`${emailId}-error`} className="m-0 text-[12px] text-danger">
              {error}
            </p>
          )}
        </form>
      )}
      {created && <InviteLink {...created} />}
    </li>
  );
}
