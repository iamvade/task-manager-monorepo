import { REALTIME_CLIENT_HEADER } from '@kite/shared';
import { createApiClient } from '@kite/shared/client';
import { CLIENT_ID } from '../realtime/clientId';

export { ApiError, NetworkError, parseRetryAfter, toQuery } from '@kite/shared/client';

/** Same-origin API with the session cookie; `X-Kite-Client` keeps my own changes from echoing. */
export const { apiFetch, apiSend } = createApiClient({
  baseUrl: '/api/v1',
  credentials: 'include',
  headers: () => ({ [REALTIME_CLIENT_HEADER]: CLIENT_ID }),
});
