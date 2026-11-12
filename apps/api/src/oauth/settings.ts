import type { OAuthResourceMetadata, OAuthServerMetadata } from '@kite/shared';
import { parseExtraClients, webUrl, type Config, type OAuthClient } from '../config.js';

/** An access token (a `connector` session) lives this long and never slides. */
export const ACCESS_TTL_MS = 60 * 60 * 1000;
/** A sign-in ends this long after its last refresh. */
export const GRANT_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/** Authorization codes: one use, within a minute. */
export const CODE_TTL_MS = 60 * 1000;
/**
 * The refresh token before the last rotation is only refused for this long (two refreshes that
 * raced, or a retry after a lost response); after it, seeing it again ends the sign-in.
 */
export const REFRESH_GRACE_MS = 60 * 1000;
/** Used codes are kept this long so a replay is recognized. */
export const USED_CODE_KEEP_MS = 24 * 60 * 60 * 1000;

/** Claude's published client identity (web, Desktop and mobile share it and its callback). */
export const CLAUDE_CLIENT_ID = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const CLAUDE_CLIENT: OAuthClient = {
  name: 'Claude',
  redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
};

type Urls = Pick<Config, 'WEB_ORIGIN'>;

/**
 * The only clients that may ask for access: Claude, plus `OAUTH_EXTRA_CLIENTS`. Pinned here and
 * never fetched from the client's URL, so nothing a caller sends decides where a code goes.
 */
export function oauthClients(
  config: Pick<Config, 'OAUTH_EXTRA_CLIENTS'>,
): ReadonlyMap<string, OAuthClient> {
  return new Map([
    [CLAUDE_CLIENT_ID, CLAUDE_CLIENT],
    ...Object.entries(parseExtraClients(config.OAUTH_EXTRA_CLIENTS)),
  ]);
}

/** The issuer: the web address (with its sub-path), exactly as the metadata states it. */
export const oauthIssuer = (config: Urls): string => webUrl(config, '');

/** The connector address people add to Claude, and the audience of every token. */
export const connectorResource = (config: Urls): string => webUrl(config, '/mcp');

export const serverMetadata = (config: Urls): OAuthServerMetadata => ({
  issuer: oauthIssuer(config),
  // The consent page in the web app; it posts to /oauth/authorize with the session cookie.
  authorization_endpoint: webUrl(config, '/oauth/authorize'),
  token_endpoint: webUrl(config, '/api/v1/oauth/token'),
  revocation_endpoint: webUrl(config, '/api/v1/oauth/revoke'),
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  revocation_endpoint_auth_methods_supported: ['none'],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
});

export const resourceMetadata = (config: Urls): OAuthResourceMetadata => ({
  resource: connectorResource(config),
  authorization_servers: [oauthIssuer(config)],
  bearer_methods_supported: ['header'],
  resource_name: 'Kite Tasks',
});
