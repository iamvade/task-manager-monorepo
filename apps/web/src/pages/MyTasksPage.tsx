import { shortName } from '@kite/shared';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useLogout } from '../api/auth';
import { useAuth } from '../auth/useAuth';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { Button } from '../components/ui/Button';

/** Placeholder until the My Tasks phase: proves the session and offers sign-out. */
export function MyTasksPage() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!me) return null;

  return (
    <main className="mx-auto flex max-w-[720px] flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-[24px] leading-8 font-semibold tracking-[-0.01em]">
          {t('nav.myTasks')}
        </h1>
        <LanguageSwitcher />
      </div>
      <p className="text-[13px] text-text-muted">
        {t('auth.signedInAs', { name: shortName(me.user.name) })} · {me.workspaces[0]?.name}
      </p>
      <div>
        <Button
          disabled={logout.isPending}
          onClick={() => {
            logout.mutate(undefined, {
              onSettled: () => void navigate('/login', { replace: true }),
            });
          }}
        >
          {t('auth.signOut')}
        </Button>
      </div>
    </main>
  );
}
