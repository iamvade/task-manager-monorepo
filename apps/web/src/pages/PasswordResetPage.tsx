import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { usePasswordReset, useResetPassword } from '../api/auth';
import { ApiError } from '../api/client';
import { AuthLayout } from '../auth/AuthLayout';
import { FormError } from '../auth/FormError';
import { PasswordField } from '../auth/PasswordField';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';

const MIN_PASSWORD = 8;

const signInLink =
  'inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-accent text-[13px] font-medium text-white';

/**
 * `/reset-password/:token`: a one-time link from the platform admin (no email delivery). Not in
 * the designs; built like the invite page. Setting the password signs the person out everywhere,
 * so it ends on "Sign in" instead of signing in.
 */
export function PasswordResetPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const reset = usePasswordReset(token);
  const save = useResetPassword(token);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const saveInvalid = save.error instanceof ApiError && save.error.code === 'RESET_INVALID';

  // First: a person signed in here as themselves is forgotten, which drops the preview too.
  if (save.isSuccess) {
    return (
      <AuthLayout title={t('passwordReset.doneTitle')} subtitle={t('passwordReset.doneBody')}>
        <Link to="/login" className={signInLink}>
          {t('invite.goToSignIn')}
        </Link>
      </AuthLayout>
    );
  }

  if (reset.isPending) {
    return (
      <AuthLayout title={t('common.loading')}>
        <span />
      </AuthLayout>
    );
  }

  if (reset.isError || saveInvalid) {
    return (
      <AuthLayout title={t('passwordReset.invalidTitle')} subtitle={t('passwordReset.invalidBody')}>
        <Link to="/login" className={signInLink}>
          {t('invite.goToSignIn')}
        </Link>
      </AuthLayout>
    );
  }

  const passwordError =
    submitted && password.length < MIN_PASSWORD ? t('invite.passwordTooShort') : undefined;
  const confirmError = submitted && confirm !== password ? t('invite.passwordMismatch') : undefined;

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (password.length < MIN_PASSWORD || confirm !== password) return;
    save.mutate(password);
  }

  return (
    <AuthLayout
      title={t('passwordReset.title')}
      subtitle={t('passwordReset.subtitle', { name: reset.data.name })}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {save.error && <FormError>{t('common.genericError')}</FormError>}
        <TextField
          label={t('auth.email')}
          type="email"
          name="email"
          autoComplete="username"
          value={reset.data.email}
          readOnly
        />
        <PasswordField
          label={t('invite.newPassword')}
          name="new-password"
          autoComplete="new-password"
          autoFocus
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
          disabled={save.isPending}
        >
          {save.isPending ? t('passwordReset.saving') : t('passwordReset.save')}
        </Button>
      </form>
    </AuthLayout>
  );
}
