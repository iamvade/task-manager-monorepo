import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { safeNext } from './safeNext';
import { useAuth } from './useAuth';

function FullPageStatus() {
  const { t } = useTranslation();
  return (
    <main className="grid min-h-screen place-items-center bg-subtle">
      <p role="status" className="text-[13px] text-muted">
        {t('common.loading')}
      </p>
    </main>
  );
}

/** Layout route: renders children only with a session, otherwise redirects to /login?next=…. */
export function RequireAuth() {
  const { me, isError } = useAuth();
  const location = useLocation();
  if (me === undefined && !isError) return <FullPageStatus />;
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/** Layout route for /login: already signed in → straight to `next` (or My Tasks). */
export function RedirectIfAuthed() {
  const { me, isError } = useAuth();
  const [params] = useSearchParams();
  if (me === undefined && !isError) return <FullPageStatus />;
  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Outlet />;
}
