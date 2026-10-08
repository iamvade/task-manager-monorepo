import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../auth/AuthLayout';
import { safeNext } from '../auth/safeNext';
import { LoginForm } from '../auth/LoginForm';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  return (
    <AuthLayout title={t('auth.signInTitle')} subtitle={t('auth.signInSubtitle')}>
      <LoginForm onSuccess={() => void navigate(safeNext(params.get('next')), { replace: true })} />
    </AuthLayout>
  );
}
