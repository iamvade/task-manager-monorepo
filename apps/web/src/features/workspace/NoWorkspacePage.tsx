import { useTranslation } from 'react-i18next';
import { useLogout } from '../../api/auth';
import { AuthLayout } from '../../auth/AuthLayout';
import { useAuth } from '../../auth/useAuth';
import { Button } from '../../components/ui/Button';

/** Signed in, but not (or no longer) a member of any workspace. */
export function NoWorkspacePage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const logout = useLogout();
  return (
    <AuthLayout
      title={t('workspace.noneTitle')}
      subtitle={t('workspace.noneBody', { email: me?.user.email ?? '' })}
    >
      <Button
        size="lg"
        className="w-full"
        disabled={logout.isPending}
        onClick={() => {
          logout.mutate();
        }}
      >
        {t('workspace.signOut')}
      </Button>
    </AuthLayout>
  );
}
