import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router';
import { ErrorState } from '../components/ErrorState';
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

/**
 * Layout route: renders children only with a session, otherwise redirects to /login?next=….
 * A server that can't be reached is not a sign-out: the page offers Try again instead.
 */
export function RequireAuth() {
  const { me, isError, error } = useAuth();
  const location = useLocation();
  if (me === undefined && !isError) return <FullPageStatus />;
  if (me === undefined) {
    return (
      <main className="flex min-h-screen bg-default text-default">
        <ErrorState error={error} />
      </main>
    );
  }
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  // The platform admin belongs to no workspace: the admin console is all there is for them.
  if (me.user.platformRole === 'vade' && location.pathname !== '/admin') {
    return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}

/** Layout route for /admin (inside `RequireAuth`): the platform admin only, others go home. */
export function RequireVade() {
  const { me } = useAuth();
  if (me?.user.platformRole !== 'vade') return <Navigate to="/my-tasks" replace />;
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
