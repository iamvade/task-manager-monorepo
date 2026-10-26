import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, type TextInputInstance } from 'react-native';
import { useLogin } from '../api/auth';
import { NetworkError, isApiError } from '../api/client';
import { Button } from '../components/form/Button';
import { FormAlert } from '../components/form/FormAlert';
import { TextField } from '../components/form/TextField';
import { clockLabel, useCountdown } from './useCountdown';

interface SignInFormProps {
  /** The invite's email: shown read-only. */
  fixedEmail?: string;
  onSuccess?: () => void;
}

/** Email + password sign-in (`client: "mobile"`), with the lockout countdown from `Retry-After`. */
export function SignInForm({ fixedEmail, onSuccess }: SignInFormProps) {
  const { t } = useTranslation();
  const login = useLogin();
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [password, setPassword] = useState('');
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const locked = useCountdown(lockedUntil);

  const submit = () => {
    if (locked > 0 || !email.trim() || !password) return;
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess,
        onError: (error) => {
          if (isApiError(error, 'RATE_LIMITED') && error.retryAfter !== undefined) {
            setLockedUntil(Date.now() + error.retryAfter * 1000);
          }
        },
      },
    );
  };

  const error = login.error;
  let alert = null;
  if (locked > 0) {
    alert = <FormAlert title={t('auth.lockedTitle')}>{t('auth.lockedBody')}</FormAlert>;
  } else if (isApiError(error, 'INVALID_CREDENTIALS')) {
    alert = <FormAlert>{t('auth.invalidCredentials')}</FormAlert>;
  } else if (isApiError(error, 'RATE_LIMITED')) {
    alert = <FormAlert>{t('auth.rateLimited')}</FormAlert>;
  } else if (error instanceof NetworkError) {
    alert = <FormAlert>{t('errors.network')}</FormAlert>;
  } else if (error) {
    alert = <FormAlert>{t('common.genericError')}</FormAlert>;
  }

  return (
    <>
      {alert}
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        editable={fixedEmail === undefined}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="username"
        keyboardType="email-address"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <TextField
        ref={passwordRef}
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        password
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button
        label={
          locked > 0
            ? t('auth.lockedButton', { time: clockLabel(locked) })
            : login.isPending
              ? t('auth.signingIn')
              : t('auth.signIn')
        }
        busy={login.isPending}
        disabled={locked > 0 || !email.trim() || !password}
        onPress={submit}
      />
      <Button
        variant="plain"
        label={t('auth.forgotPassword')}
        onPress={() => {
          Alert.alert(t('auth.forgotPassword'), t('auth.forgotPasswordBody'), [
            { text: t('common.close') },
          ]);
        }}
      />
    </>
  );
}
