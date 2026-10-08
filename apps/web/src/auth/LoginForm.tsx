import type { MeResponse } from '@kite/shared';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogin } from '../api/auth';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { FormError } from './FormError';
import { PasswordField } from './PasswordField';

interface LoginFormProps {
  /** Prefilled and read-only (invite accept for an existing account). */
  fixedEmail?: string;
  onSuccess: (me: MeResponse) => void;
}

export function LoginForm({ fixedEmail, onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate({ email: email.trim(), password }, { onSuccess });
  }

  const error = login.error;
  const message =
    error instanceof ApiError && error.code === 'INVALID_CREDENTIALS'
      ? t('auth.invalidCredentials')
      : error instanceof ApiError && error.code === 'RATE_LIMITED'
        ? t('auth.rateLimited')
        : error
          ? t('common.genericError')
          : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {message ? <FormError>{message}</FormError> : null}
      <TextField
        label={t('auth.email')}
        type="email"
        name="email"
        autoComplete="username"
        required
        autoFocus={!fixedEmail}
        readOnly={Boolean(fixedEmail)}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
        }}
      />
      <PasswordField
        label={t('auth.password')}
        name="password"
        autoComplete="current-password"
        required
        autoFocus={Boolean(fixedEmail)}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
        }}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        className="mt-2 w-full"
        disabled={login.isPending || !email.trim() || !password}
      >
        {login.isPending ? t('auth.signingIn') : t('auth.signIn')}
      </Button>
    </form>
  );
}
