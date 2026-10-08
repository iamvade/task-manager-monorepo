import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useAcceptInvite, useInvite, useLogout } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthLayout } from '../auth/AuthLayout';
import { useAuth } from '../auth/useAuth';
import { FormError } from '../auth/FormError';
import { LoginForm } from '../auth/LoginForm';
import { PasswordField } from '../auth/PasswordField';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

const MIN_PASSWORD = 8;

export function InviteAcceptPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const { me } = useAuth();

  const onJoined = () => void navigate('/my-tasks', { replace: true });
  const acceptInvalid = accept.error instanceof ApiError && accept.error.code === 'INVITE_INVALID';

  if (invite.isPending) {
    return (
      <AuthLayout title={t('common.loading')}>
        <span />
      </AuthLayout>
    );
  }

  if (invite.isError || acceptInvalid) {
    return (
      <AuthLayout title={t('invite.invalidTitle')} subtitle={t('invite.invalidBody')}>
        <Link
          to="/login"
          className="inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-accent text-[13px] font-medium text-white"
        >
          {t('invite.goToSignIn')}
        </Link>
      </AuthLayout>
    );
  }

  const preview = invite.data;
  const signedInAsInvitee = me?.user.email.toLowerCase() === preview.email.toLowerCase();
  const acceptError = accept.error ? <FormError>{t('common.genericError')}</FormError> : null;

  let body;
  if (!preview.accountExists) {
    body = (
      <NewAccountForm
        email={preview.email}
        pending={accept.isPending}
        error={acceptError}
        onSubmit={(name, password) => {
          accept.mutate({ name, password }, { onSuccess: onJoined });
        }}
      />
    );
  } else if (signedInAsInvitee) {
    body = (
      <div className="flex flex-col gap-4">
        {acceptError}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={accept.isPending}
          onClick={() => {
            accept.mutate({}, { onSuccess: onJoined });
          }}
        >
          {accept.isPending ? t('invite.joining') : t('invite.join')}
        </Button>
      </div>
    );
  } else if (me) {
    body = <SwitchAccount email={me.user.email} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-text-2">{t('invite.signInToJoin')}</p>
        {acceptError}
        <LoginForm
          fixedEmail={preview.email}
          onSuccess={() => {
            accept.mutate({}, { onSuccess: onJoined });
          }}
        />
      </div>
    );
  }

  return (
    <AuthLayout
      title={t('invite.title', { workspace: preview.workspace.name })}
      subtitle={t('invite.invitedAs', { email: preview.email })}
    >
      {body}
    </AuthLayout>
  );
}

function SwitchAccount({ email }: { email: string }) {
  const { t } = useTranslation();
  const logout = useLogout();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-text-2">{t('invite.signedInAsOther', { email })}</p>
      <Button
        size="lg"
        className="w-full"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate();
        }}
      >
        {t('invite.switchAccount')}
      </Button>
    </div>
  );
}

interface NewAccountFormProps {
  email: string;
  pending: boolean;
  error: ReactNode;
  onSubmit: (name: string, password: string) => void;
}

function NewAccountForm({ email, pending, error, onSubmit }: NewAccountFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const passwordError =
    submitted && password.length < MIN_PASSWORD ? t('invite.passwordTooShort') : undefined;
  const confirmError = submitted && confirm !== password ? t('invite.passwordMismatch') : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || password.length < MIN_PASSWORD || confirm !== password) return;
    onSubmit(name.trim(), password);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {error}
      <TextField label={t('auth.email')} type="email" value={email} readOnly />
      <TextField
        label={t('invite.name')}
        name="name"
        autoComplete="name"
        autoFocus
        required
        maxLength={80}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
      />
      <PasswordField
        label={t('invite.newPassword')}
        name="new-password"
        autoComplete="new-password"
        required
        hint={t('invite.passwordHint')}
        error={passwordError}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <PasswordField
        label={t('invite.confirmPassword')}
        name="confirm-password"
        autoComplete="new-password"
        required
        error={confirmError}
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
        }}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-2 w-full"
        disabled={pending || !name.trim()}
      >
        {pending ? t('invite.creating') : t('invite.createAccount')}
      </Button>
    </form>
  );
}
