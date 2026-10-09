import { useTranslation } from 'react-i18next';
import { Link, isRouteErrorResponse, useRouteError } from 'react-router';
import { ApiError } from '../api/client';
import { Button } from './ui/Button';
import { buttonVariants } from './ui/buttonStyles';
import { EmptyState } from './ui/EmptyState';

function isNotFound(error: unknown) {
  return (
    (error instanceof ApiError && error.status === 404) ||
    (isRouteErrorResponse(error) && error.status === 404)
  );
}

/** Full-area error: "not found" for 404s (no access looks the same), otherwise reload. */
export function ErrorState({ error }: { error: unknown }) {
  const { t } = useTranslation();
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
  return (
    <div role="alert" className="flex flex-1">
      <EmptyState
        title={t('common.errorTitle')}
        body={t('common.errorBody')}
        actions={
          <Button
            variant="primary"
            onClick={() => {
              window.location.reload();
            }}
          >
            {t('common.reload')}
          </Button>
        }
      />
    </div>
  );
}

/** Route `errorElement`: errors thrown while matching/loading a route. */
export function RouteError() {
  const error = useRouteError();
  return (
    <main className="flex min-h-screen bg-default text-default">
      <ErrorState error={error} />
    </main>
  );
}
