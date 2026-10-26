import { passwordSchema } from '@kite/shared';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text } from 'react-native';
import { useAcceptInvite, useInvite, useLogout } from '../../../api/auth';
import { isApiError } from '../../../api/client';
import { SignInForm } from '../../../auth/SignInForm';
import { useAuth } from '../../../auth/useAuth';
import { AuthScreen } from '../../../components/AuthScreen';
import { Button } from '../../../components/form/Button';
import { FormAlert } from '../../../components/form/FormAlert';
import { TextField } from '../../../components/form/TextField';
import { useTheme } from '../../../theme/ThemeProvider';

/** `/invite/:token` (also `kitetasks://invite/:token`): the web's accept page, as a screen. */
export default function AcceptInvite() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const invite = useInvite(token);
  const accept = useAcceptInvite(token);
  const logout = useLogout();
  const { me } = useAuth();

  // Into the workspace just joined, not the one used last; once the new `me` (with it) is in.
  const [joined, setJoined] = useState(false);
  const onJoined = () => {
    setJoined(true);
  };
  const joinedSlug = invite.data?.workspace.slug;
  if (joined && joinedSlug && me?.workspaces.some((w) => w.slug === joinedSlug)) {
    return <Redirect href={{ pathname: '/w/[slug]/my-tasks', params: { slug: joinedSlug } }} />;
  }

  if (invite.isPending) {
    return (
      <AuthScreen title={t('common.loading')}>
        <ActivityIndicator color={theme.colors.iconMuted} />
      </AuthScreen>
    );
  }

  if (invite.isError || isApiError(accept.error, 'INVITE_INVALID')) {
    return (
      <AuthScreen title={t('invite.invalidTitle')} subtitle={t('invite.invalidBody')}>
        <Button
          variant="secondary"
          label={me ? t('common.close') : t('invite.goToSignIn')}
          onPress={() => {
            router.replace(me ? '/' : '/sign-in');
          }}
        />
      </AuthScreen>
    );
  }

  const preview = invite.data;
  const signedInAsInvitee = me?.user.email.toLowerCase() === preview.email.toLowerCase();
  const acceptError = accept.error ? (
    <FormAlert>
      {isApiError(accept.error, 'ACCOUNT_EXISTS')
        ? t('invite.accountExists')
        : t('common.genericError')}
    </FormAlert>
  ) : null;

  let body;
  if (!preview.accountExists) {
    body = (
      <NewAccountForm
        email={preview.email}
        pending={accept.isPending}
        error={acceptError}
        onSubmit={(name, password) => {
          accept.mutate(
            { name, password },
            {
              onSuccess: onJoined,
              // Another invite created the account meanwhile: switch to signing in.
              onError: (error) => {
                if (isApiError(error, 'ACCOUNT_EXISTS')) void invite.refetch();
              },
            },
          );
        }}
      />
    );
  } else if (signedInAsInvitee) {
    body = (
      <>
        {acceptError}
        <Button
          label={accept.isPending ? t('invite.joining') : t('invite.join')}
          busy={accept.isPending}
          onPress={() => {
            accept.mutate({}, { onSuccess: onJoined });
          }}
        />
      </>
    );
  } else if (me) {
    body = (
      <>
        <Text
          style={[theme.type.base, { color: theme.colors.text2, fontFamily: theme.fontFor(400) }]}
        >
          {t('invite.signedInAsOther', { email: me.user.email })}
        </Text>
        <Button
          variant="secondary"
          label={t('invite.switchAccount')}
          busy={logout.isPending}
          onPress={() => {
            logout.mutate();
          }}
        />
      </>
    );
  } else {
    body = (
      <>
        <Text
          style={[theme.type.base, { color: theme.colors.text2, fontFamily: theme.fontFor(400) }]}
        >
          {t('invite.signInToJoin')}
        </Text>
        {acceptError}
        <SignInForm
          fixedEmail={preview.email}
          onSuccess={() => {
            accept.mutate({}, { onSuccess: onJoined });
          }}
        />
      </>
    );
  }

  return (
    <AuthScreen
      title={t('invite.title', { workspace: preview.workspace.name })}
      subtitle={t('invite.invitedAs', { email: preview.email })}
    >
      {body}
    </AuthScreen>
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
    submitted && !passwordSchema.safeParse(password).success ? t('invite.passwordTooShort') : null;
  const confirmError =
    submitted && !passwordError && confirm !== password ? t('invite.passwordMismatch') : null;

  const submit = () => {
    setSubmitted(true);
    if (!name.trim() || !passwordSchema.safeParse(password).success || confirm !== password) return;
    onSubmit(name.trim(), password);
  };

  return (
    <>
      {error}
      <TextField label={t('auth.email')} value={email} editable={false} />
      <TextField
        label={t('invite.name')}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
      />
      <TextField
        label={t('invite.newPassword')}
        value={password}
        onChangeText={setPassword}
        password
        hint={t('invite.passwordHint')}
        error={passwordError}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label={t('invite.confirmPassword')}
        value={confirm}
        onChangeText={setConfirm}
        password
        error={confirmError}
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button
        label={pending ? t('invite.creating') : t('invite.createAccount')}
        busy={pending}
        disabled={!name.trim()}
        onPress={submit}
      />
    </>
  );
}
