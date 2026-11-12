import type { OAuthAuthorizeParams } from '@kite/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useLogout } from '../api/auth';
import { ApiError } from '../api/client';
import { useAuthorize, useAuthorizeCheck } from '../api/oauth';
import { AuthLayout } from '../auth/AuthLayout';
import { FormError } from '../auth/FormError';
import { useAuth } from '../auth/useAuth';
import { Button } from '../components/ui/Button';
import { leaveTo } from '../lib/leaveTo';

const backLink =
  'inline-flex h-10 w-full items-center justify-center rounded-[8px] bg-accent text-[13px] font-medium text-white';

/** The OAuth authorization request as the client put it in the URL (snake_case, RFC 6749). */
function readParams(query: URLSearchParams): OAuthAuthorizeParams | null {
  const clientId = query.get('client_id');
  const redirectUri = query.get('redirect_uri');
  if (!clientId || !redirectUri) return null;
  const optional = (name: string) => query.get(name) ?? undefined;
  return {
    clientId,
    redirectUri,
    responseType: optional('response_type'),
    codeChallenge: optional('code_challenge'),
    codeChallengeMethod: optional('code_challenge_method'),
    state: optional('state'),
    resource: optional('resource'),
    scope: optional('scope'),
  };
}

/**
 * `/oauth/authorize`: the consent step of the remote Claude connector. Claude sends the person
 * here; signed out they sign in first and come back. Not in the designs; built like the invite
 * and reset pages. Nothing is granted until Allow, and a request that doesn't check out (unknown
 * app, wrong return address) shows an error and never leaves for another site.
 */
export function OAuthConsentPage() {
  const { t } = useTranslation();
  const { me, isError } = useAuth();
  const location = useLocation();
  const [query] = useSearchParams();
  const params = useMemo(() => readParams(query), [query]);
  const signedIn = Boolean(me) && me?.user.platformRole == null;
  const check = useAuthorizeCheck(signedIn ? params : null);
  const authorize = useAuthorize();
  const logout = useLogout();

  if (me === undefined && !isError) {
    return (
      <AuthLayout title={t('common.loading')}>
        <span />
      </AuthLayout>
    );
  }
  if (!me) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (me.user.platformRole != null) {
    return (
      <AuthLayout title={t('oauth.consent.adminTitle')} subtitle={t('oauth.consent.adminBody')}>
        <Link to="/admin" className={backLink}>
          {t('oauth.consent.backToKite')}
        </Link>
      </AuthLayout>
    );
  }
  if (!params || check.isError) {
    const notAllowed =
      check.error instanceof ApiError && check.error.code === 'OAUTH_INVALID_CLIENT';
    return (
      <AuthLayout
        title={t('oauth.consent.invalidTitle')}
        subtitle={t(notAllowed ? 'oauth.consent.notAllowedBody' : 'oauth.consent.invalidBody')}
      >
        <Link to="/" className={backLink}>
          {t('oauth.consent.backToKite')}
        </Link>
      </AuthLayout>
    );
  }
  if (!check.data) {
    return (
      <AuthLayout title={t('common.loading')}>
        <span />
      </AuthLayout>
    );
  }

  const { clientName, redirectHost } = check.data;
  // Stays busy after a success: the browser is on its way to the app.
  const busy = authorize.isPending || authorize.isSuccess;
  const answer = (approve: boolean) => {
    authorize.mutate(
      { ...params, approve },
      {
        onSuccess: ({ redirectTo }) => {
          leaveTo(redirectTo);
        },
      },
    );
  };

  return (
    <AuthLayout
      title={t('oauth.consent.title', { app: clientName })}
      subtitle={t('oauth.consent.signedInAs', { name: me.user.name, email: me.user.email })}
    >
      <div className="flex flex-col gap-4">
        {authorize.isError && <FormError>{t('common.genericError')}</FormError>}
        <div className="flex flex-col gap-2 text-[13px]">
          <p className="m-0 font-medium">{t('oauth.consent.canTitle', { app: clientName })}</p>
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-2">
            <li>{t('oauth.consent.canRead')}</li>
            <li>{t('oauth.consent.canWrite')}</li>
          </ul>
          <p className="m-0 text-2">{t('oauth.consent.cannot')}</p>
        </div>
        <p className="m-0 text-[12px] text-muted">
          {t('oauth.consent.returnTo', { host: redirectHost })}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => {
              answer(true);
            }}
          >
            {t('oauth.consent.allow')}
          </Button>
          <Button
            size="lg"
            className="w-full"
            disabled={busy}
            onClick={() => {
              answer(false);
            }}
          >
            {t('common.cancel')}
          </Button>
        </div>
        <p className="m-0 text-center text-[12px] text-muted">
          <button
            type="button"
            className="cursor-pointer border-0 bg-transparent p-0 text-[12px] text-accent-ink underline"
            disabled={busy}
            onClick={() => {
              logout.mutate();
            }}
          >
            {t('oauth.consent.switchAccount')}
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}
