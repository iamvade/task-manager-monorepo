import { z } from 'zod';
import { sessionClientSchema } from '../enums.js';

/**
 * The remote Claude connector (OAuth 2.1 authorization code + PKCE). Kite's own routes take
 * camelCase JSON from the consent page; the token and revoke endpoints speak the OAuth wire
 * format (snake_case, form encoded, RFC 6749 error bodies) because Claude calls them.
 */

const param = (max = 2048) => z.string().max(max);

/**
 * What the client put in the authorization URL, as the consent page read it. Everything but the
 * client and redirect URI is optional here so the server can say what is wrong with it.
 */
export const oauthAuthorizeParamsSchema = z
  .object({
    clientId: param().min(1),
    redirectUri: param().min(1),
    responseType: param(40).optional(),
    codeChallenge: param(200).optional(),
    codeChallengeMethod: param(40).optional(),
    /** Opaque to Kite; sent back unchanged. */
    state: param().optional(),
    /** RFC 8707: must be this server's connector address when present. */
    resource: param().optional(),
    /** Ignored: a connector sign-in is the whole account. */
    scope: param().optional(),
  })
  .meta({ id: 'OAuthAuthorizeParams' });
export type OAuthAuthorizeParams = z.infer<typeof oauthAuthorizeParamsSchema>;

/** Who is asking, for the consent page. */
export const oauthAuthorizeCheckSchema = z
  .object({
    clientName: z.string(),
    /** Host the person is sent back to after choosing (e.g. `claude.ai`). */
    redirectHost: z.string(),
  })
  .meta({ id: 'OAuthAuthorizeCheck' });
export type OAuthAuthorizeCheck = z.infer<typeof oauthAuthorizeCheckSchema>;

export const oauthAuthorizeRequestSchema = oauthAuthorizeParamsSchema
  .extend({ approve: z.boolean() })
  .meta({ id: 'OAuthAuthorizeRequest' });
export type OAuthAuthorizeRequest = z.infer<typeof oauthAuthorizeRequestSchema>;

/** Where the consent page sends the browser: the client's redirect URI with `code` or `error`. */
export const oauthAuthorizeResultSchema = z
  .object({ redirectTo: z.string() })
  .meta({ id: 'OAuthAuthorizeResult' });
export type OAuthAuthorizeResult = z.infer<typeof oauthAuthorizeResultSchema>;

/** One connector sign-in (Settings → Claude → Connected). */
export const oauthGrantSchema = z
  .object({
    id: z.uuid(),
    clientName: z.string(),
    createdAt: z.iso.datetime(),
    /** Moves each time the client refreshes its access (about hourly while in use). */
    lastUsedAt: z.iso.datetime(),
  })
  .meta({ id: 'OAuthGrant' });
export type OAuthGrant = z.infer<typeof oauthGrantSchema>;

export const oauthGrantsSchema = z
  .object({
    /** The address people paste into Claude ("Add custom connector"). */
    connectorUrl: z.string(),
    grants: z.array(oauthGrantSchema),
  })
  .meta({ id: 'OAuthGrants' });
export type OAuthGrants = z.infer<typeof oauthGrantsSchema>;

/** What the calling session is: the MCP server's audience check. */
export const oauthTokenInfoSchema = z
  .object({
    client: sessionClientSchema,
    /** The connector address the token was issued for; null for any other kind of session. */
    resource: z.string().nullable(),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: 'OAuthTokenInfo' });
export type OAuthTokenInfo = z.infer<typeof oauthTokenInfoSchema>;

/** RFC 8414 authorization server metadata. */
export const oauthServerMetadataSchema = z
  .object({
    issuer: z.string(),
    authorization_endpoint: z.string(),
    token_endpoint: z.string(),
    revocation_endpoint: z.string(),
    response_types_supported: z.array(z.string()),
    grant_types_supported: z.array(z.string()),
    code_challenge_methods_supported: z.array(z.string()),
    token_endpoint_auth_methods_supported: z.array(z.string()),
    revocation_endpoint_auth_methods_supported: z.array(z.string()),
    client_id_metadata_document_supported: z.boolean(),
    authorization_response_iss_parameter_supported: z.boolean(),
  })
  .meta({ id: 'OAuthServerMetadata' });
export type OAuthServerMetadata = z.infer<typeof oauthServerMetadataSchema>;

/** RFC 9728 protected resource metadata. */
export const oauthResourceMetadataSchema = z
  .object({
    resource: z.string(),
    authorization_servers: z.array(z.string()),
    bearer_methods_supported: z.array(z.string()),
    resource_name: z.string(),
  })
  .meta({ id: 'OAuthResourceMetadata' });
export type OAuthResourceMetadata = z.infer<typeof oauthResourceMetadataSchema>;

const wire = z.string().max(2048).optional();

/** RFC 6749 §4.1.3 / §6 token request (form encoded). Checked by hand to answer OAuth errors. */
export const oauthTokenRequestSchema = z
  .looseObject({
    grant_type: wire,
    code: wire,
    code_verifier: wire,
    redirect_uri: wire,
    client_id: wire,
    refresh_token: wire,
    resource: wire,
  })
  .meta({ id: 'OAuthTokenRequest' });
export type OAuthTokenRequest = z.infer<typeof oauthTokenRequestSchema>;

export const oauthTokenResponseSchema = z
  .object({
    access_token: z.string(),
    token_type: z.literal('Bearer'),
    /** Seconds. */
    expires_in: z.number().int(),
    refresh_token: z.string(),
  })
  .meta({ id: 'OAuthTokenResponse' });
export type OAuthTokenResponse = z.infer<typeof oauthTokenResponseSchema>;

/** RFC 7009 revocation request (form encoded). */
export const oauthRevokeRequestSchema = z
  .looseObject({ token: wire, token_type_hint: wire })
  .meta({ id: 'OAuthRevokeRequest' });

/** RFC 6749 §5.2 error body (the token endpoint's errors, not Kite's usual envelope). */
export const oauthErrorSchema = z
  .object({ error: z.string(), error_description: z.string().optional() })
  .meta({ id: 'OAuthError' });
export type OAuthError = z.infer<typeof oauthErrorSchema>;
