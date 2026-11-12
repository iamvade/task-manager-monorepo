import {
  REALTIME_CLOSE_UNAUTHORIZED,
  apiErrorSchema,
  oauthAuthorizeCheckSchema,
  oauthAuthorizeParamsSchema,
  oauthAuthorizeRequestSchema,
  oauthAuthorizeResultSchema,
  oauthErrorSchema,
  oauthGrantsSchema,
  oauthResourceMetadataSchema,
  oauthRevokeRequestSchema,
  oauthServerMetadataSchema,
  oauthTokenInfoSchema,
  oauthTokenRequestSchema,
  oauthTokenResponseSchema,
} from '@kite/shared';
import { and, desc, eq, gt } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth, type AuthContext } from '../auth/plugin.js';
import { oauthGrants, sessions } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import {
  deleteGrant,
  issueCode,
  issueTokens,
  redirectBack,
  revokeToken,
  validateAuthorize,
} from '../oauth/service.js';
import { connectorResource, resourceMetadata, serverMetadata } from '../oauth/settings.js';
import { FailureThrottle } from '../oauth/throttle.js';

const err = apiErrorSchema;
/** The token endpoint answers RFC 6749 errors; a malformed body still gets Kite's envelope. */
const tokenError = z.union([oauthErrorSchema, apiErrorSchema]);

const FORM = /^application\/x-www-form-urlencoded(?:\s*;.*)?$/i;

/**
 * Only the web app's cookie session may approve or manage connector sign-ins. A bearer request
 * passes the CSRF check without an Origin, so without this a leaked token could approve a new
 * sign-in for itself that outlives its own revocation.
 */
function requireCookieSession(request: FastifyRequest): AuthContext {
  const auth = requireAuth(request);
  if (auth.via !== 'cookie') {
    throw httpError(
      403,
      'COOKIE_SESSION_REQUIRED',
      'Connector sign-ins are managed from the web app only',
    );
  }
  return auth;
}

/**
 * The remote Claude connector's OAuth 2.1 authorization server (`CONNECTOR_ENABLED`): metadata,
 * the consent page's two calls, the token and revoke endpoints Claude's servers call, and the
 * person's connector sign-ins. Clients are an allow-list (`oauthClients`); there is no
 * registration endpoint.
 */
export const oauthRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  const throttle = new FailureThrottle();
  const closeSessions = (ids: string[]) => {
    for (const id of ids) app.realtime.hub.closeSession(id, REALTIME_CLOSE_UNAUTHORIZED);
  };

  // RFC 6749 token requests are form encoded; only these routes accept that.
  app.addContentTypeParser(
    FORM,
    { parseAs: 'string', bodyLimit: 16 * 1024 },
    (_req, body, next) => {
      next(null, Object.fromEntries(new URLSearchParams(body as string)));
    },
  );

  const noStore = (reply: FastifyReply) =>
    reply.header('cache-control', 'no-store').header('pragma', 'no-cache');

  app.get(
    '/oauth/metadata',
    {
      schema: {
        tags: ['OAuth'],
        summary: 'Authorization server metadata',
        description:
          'RFC 8414. The proxy also serves it at `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration` (with the sub-path inserted or appended). No `registration_endpoint`: only allow-listed clients (Claude’s published identity) may connect.',
        security: [],
        response: { 200: oauthServerMetadataSchema },
      },
    },
    () => serverMetadata(app.config),
  );

  app.get(
    '/oauth/resource-metadata',
    {
      schema: {
        tags: ['OAuth'],
        summary: 'Protected resource metadata',
        description:
          'RFC 9728, for the connector address (`<web address>/mcp`). The MCP server points here in `WWW-Authenticate: Bearer resource_metadata="…"`; the proxy also serves it at `/.well-known/oauth-protected-resource`.',
        security: [],
        response: { 200: oauthResourceMetadataSchema },
      },
    },
    () => resourceMetadata(app.config),
  );

  app.post(
    '/oauth/authorize/check',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['OAuth'],
        summary: 'Check an authorization request',
        description:
          'What the consent page shows: the app’s name and where the person is sent back. 400 `OAUTH_INVALID_CLIENT` (not on the allow-list), `OAUTH_INVALID_REDIRECT` (not exactly one of the client’s redirect URIs) or `OAUTH_INVALID_REQUEST` (PKCE S256 challenge, `response_type=code`, `resource`); none of them ever redirects. Web session only: a bearer caller gets 403 `COOKIE_SESSION_REQUIRED`; the platform admin gets 403 `FORBIDDEN`.',
        body: oauthAuthorizeParamsSchema,
        response: { 200: oauthAuthorizeCheckSchema, 400: err, 401: err, 403: err },
      },
    },
    (request) => {
      const { user } = requireCookieSession(request);
      const authorize = validateAuthorize(app.config, request.body);
      if (user.platformRole !== null) {
        throw httpError(403, 'FORBIDDEN', 'The platform admin cannot connect Claude');
      }
      return {
        clientName: authorize.client.name,
        redirectHost: new URL(authorize.redirectUri).host,
      };
    },
  );

  app.post(
    '/oauth/authorize',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['OAuth'],
        summary: 'Allow or refuse an app',
        description:
          'The consent page’s answer. `approve: true` makes a single-use authorization code (60 s, bound to the client, redirect URI, PKCE challenge and resource) and returns the client’s redirect URI with `code`, `state` and `iss`; `false` returns it with `error=access_denied`. Asked every time: no approval is remembered. Same checks and errors as the check route.',
        body: oauthAuthorizeRequestSchema,
        response: { 200: oauthAuthorizeResultSchema, 400: err, 401: err, 403: err },
      },
    },
    async (request) => {
      const { user } = requireCookieSession(request);
      const authorize = validateAuthorize(app.config, request.body);
      if (user.platformRole !== null) {
        throw httpError(403, 'FORBIDDEN', 'The platform admin cannot connect Claude');
      }
      if (!request.body.approve) {
        return { redirectTo: redirectBack(app.config, authorize, { error: 'access_denied' }) };
      }
      const code = await issueCode(app.db, user.id, authorize);
      return { redirectTo: redirectBack(app.config, authorize, { code }) };
    },
  );

  app.post(
    '/oauth/token',
    {
      // Called by the client's servers: no cookie, any Origin (see `originAllowed`).
      config: { crossOrigin: true },
      schema: {
        tags: ['OAuth'],
        summary: 'Token endpoint',
        description:
          'RFC 6749 §4.1.3 and §6, form encoded, public clients (`client_id` in the body, no secret). `authorization_code` needs `code`, `code_verifier`, `client_id`, `redirect_uri`; `refresh_token` needs `refresh_token`, `client_id`. Answers a one-hour access token (a bearer session that never slides) and a refresh token that is rotated on every use; the sign-in ends 30 days after its last refresh. A code used twice, or a rotated-out refresh token seen more than a minute later, ends the sign-in. Errors are RFC 6749 bodies (`{ error, error_description }`), not Kite’s envelope. Failed requests are throttled per IP (30 per 10 minutes): 429 with `Retry-After`.',
        security: [],
        body: oauthTokenRequestSchema,
        response: { 200: oauthTokenResponseSchema, 400: tokenError, 429: oauthErrorSchema },
      },
    },
    async (request, reply) => {
      noStore(reply);
      const wait = throttle.retryAfter(request.ip);
      if (wait > 0) {
        return reply
          .header('retry-after', wait)
          .code(429)
          .send({
            error: 'temporarily_unavailable',
            error_description: 'Too many failed requests',
          });
      }
      const result = await issueTokens(app.db, app.config, request.body);
      if (!result.ok) {
        throttle.fail(request.ip);
        return reply.code(result.status).send(result.body);
      }
      return result.tokens;
    },
  );

  app.post(
    '/oauth/revoke',
    {
      config: { crossOrigin: true },
      schema: {
        tags: ['OAuth'],
        summary: 'Revoke a token',
        description:
          'RFC 7009, form encoded. Ends the connector sign-in a refresh or access token belongs to (all its tokens). Always 200, also for an unknown token.',
        security: [],
        body: oauthRevokeRequestSchema,
        response: { 200: z.object({}), 400: tokenError, 429: oauthErrorSchema },
      },
    },
    async (request, reply) => {
      noStore(reply);
      const wait = throttle.retryAfter(request.ip);
      if (wait > 0) {
        return reply
          .header('retry-after', wait)
          .code(429)
          .send({
            error: 'temporarily_unavailable',
            error_description: 'Too many failed requests',
          });
      }
      const ended = request.body.token ? await revokeToken(app.db, request.body.token) : null;
      if (ended) closeSessions(ended);
      else throttle.fail(request.ip);
      return {};
    },
  );

  app.get(
    '/oauth/grants',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['OAuth'],
        summary: 'My connector sign-ins',
        description:
          'Settings → Claude: the connector address to add in Claude, and the apps signed in to my account through it, newest first. Web session only (403 `COOKIE_SESSION_REQUIRED` for a bearer caller).',
        response: { 200: oauthGrantsSchema, 401: err, 403: err },
      },
    },
    async (request) => {
      const { user } = requireCookieSession(request);
      const rows = await app.db
        .select()
        .from(oauthGrants)
        .where(and(eq(oauthGrants.userId, user.id), gt(oauthGrants.expiresAt, new Date())))
        .orderBy(desc(oauthGrants.createdAt));
      return {
        connectorUrl: connectorResource(app.config),
        grants: rows.map((row) => ({
          id: row.id,
          clientName: row.clientName,
          createdAt: row.createdAt.toISOString(),
          lastUsedAt: row.lastUsedAt.toISOString(),
        })),
      };
    },
  );

  app.delete(
    '/oauth/grants/:grantId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['OAuth'],
        summary: 'Revoke a connector sign-in',
        description:
          'Ends one of my connector sign-ins: its refresh token and every access token stop working at once. Someone else’s answers 404. Web session only.',
        params: z.object({ grantId: z.uuid() }),
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const { user } = requireCookieSession(request);
      const [grant] = await app.db
        .select({ id: oauthGrants.id })
        .from(oauthGrants)
        .where(and(eq(oauthGrants.id, request.params.grantId), eq(oauthGrants.userId, user.id)));
      if (!grant) throw httpError(404, 'NOT_FOUND', 'Sign-in not found');
      closeSessions(await deleteGrant(app.db, grant.id));
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/oauth/token-info',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['OAuth'],
        summary: 'What this session is',
        description:
          'For the MCP server’s audience check before it serves a request: the calling session’s kind and, for a connector access token, the address it was issued for. Anything but `client: "connector"` with the server’s own address is refused there.',
        response: { 200: oauthTokenInfoSchema, 401: err },
      },
    },
    async (request) => {
      const { sessionId } = requireAuth(request);
      const [row] = await app.db
        .select({
          client: sessions.client,
          expiresAt: sessions.expiresAt,
          resource: oauthGrants.resource,
        })
        .from(sessions)
        .leftJoin(oauthGrants, eq(oauthGrants.id, sessions.grantId))
        .where(eq(sessions.id, sessionId));
      if (!row) throw httpError(401, 'UNAUTHORIZED', 'Sign in required');
      return {
        client: row.client,
        resource: row.resource,
        expiresAt: row.expiresAt.toISOString(),
      };
    },
  );

  done();
};
