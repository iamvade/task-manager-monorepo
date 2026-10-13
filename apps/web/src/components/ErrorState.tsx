import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router';
import { ApiError } from '../api/client';
import { refetchErrored } from '../lib/refetchErrored';
import { Button } from './ui/Button';
import { buttonVariants } from './ui/buttonStyles';
import { EmptyState } from './ui/EmptyState';

function isNotFound(error: unknown) {
  return (
    (error instanceof ApiError && error.status === 404) ||
    (isRouteErrorResponse(error) && error.status === 404)
  );
}

interface ErrorStateProps {
  error: unknown;
  /** What "Try again" does; by default the errored queries on screen are fetched again. */
  onRetry?: () => void;
  /** Also offer a full page reload (render errors, failed chunks). */
  reload?: boolean;
}

/**
 * Full-area error: "not found" for 404s (no access looks the same), otherwise "Try again",
 * which recovers in place once the server is back; nothing here needs a page reload.
 */
export function ErrorState({ error, onRetry, reload = false }: ErrorStateProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  if (isNotFound(error)) {
    return (
      <EmptyState
        title={t('common.notFoundTitle')}
        body={t('common.notFoundBody')}
        actions={
          <Link
            to="/my-tasks"
            className={`${buttonVariants.primary} inline-flex h-8 items-center rounded-[8px] px-3 text-[13px] font-medium`}
          >
            {t('common.goToMyTasks')}
          </Link>
        }
      />
    );
  }
  // fetch rejects with a TypeError when the server can't be reached.
  const offline = error instanceof TypeError;
  const retry =
    onRetry ??
    (() => {
      refetchErrored(queryClient);
    });
  return (
    <div role="alert" className="flex flex-1">
      <EmptyState
        title={t('common.errorTitle')}
        body={offline ? t('errors.network') : t('common.errorBody')}
        actions={
          <>
            <Button variant="primary" onClick={retry}>
              {t('common.retry')}
            </Button>
            {reload && (
              <Button
                onClick={() => {
                  window.location.reload();
                }}
              >
                {t('common.reload')}
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}

/**
 * Route `errorElement`: errors thrown while matching a route or loading its chunk (the dev
 * server or CDN was unreachable). "Try again" navigates to the same place, which loads the
 * chunk again.
 */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  return (
    <main className="flex min-h-screen bg-default text-default">
      <ErrorState
        error={error}
        reload
        onRetry={() => {
          void navigate(`${pathname}${search}${hash}`, { replace: true });
        }}
      />
    </main>
  );
}
