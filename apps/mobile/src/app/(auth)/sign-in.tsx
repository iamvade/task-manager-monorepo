import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../auth/useAuth';
import { SignInForm } from '../../auth/SignInForm';
import { AuthScreen } from '../../components/AuthScreen';

export default function SignIn() {
  const { t } = useTranslation();
  const { me } = useAuth();
  // Signed in (here or just now): `/` picks the workspace.
  if (me) return <Redirect href="/" />;
  return (
    <AuthScreen title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      <SignInForm />
    </AuthScreen>
  );
}
