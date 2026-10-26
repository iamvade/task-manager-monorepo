import { REALTIME_CLIENT_HEADER } from '@kite/shared';
import { createApiClient } from '@kite/shared/client';
import { signOut } from '../auth/signOut';
import { apiBaseUrl } from '../config';
import { CLIENT_ID } from './clientId';
import { currentToken } from './session';

export { ApiError, NetworkError, isApiError, toQuery } from '@kite/shared/client';

/** The API with this app's bearer session (no cookies), `X-Kite-Client` to skip echoes. */
export const { apiFetch, apiSend } = createApiClient({
  baseUrl: `${apiBaseUrl()}/api/v1`,
  headers: () => {
    const token = currentToken();
    return {
      [REALTIME_CLIENT_HEADER]: CLIENT_ID,
      ...(token && { Authorization: `Bearer ${token}` }),
    };
  },
  // A 401 with a session means it ended (signed out elsewhere, expired): sign out here too.
  // Without one (a wrong password on sign-in) it's just the form's error.
  onUnauthorized: () => {
    if (currentToken()) void signOut();
  },
});
