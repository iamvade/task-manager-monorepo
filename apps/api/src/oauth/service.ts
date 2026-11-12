import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  OAuthAuthorizeParams,
  OAuthError,
  OAuthTokenRequest,
  OAuthTokenResponse,
} from '@kite/shared';
import { and, eq, lt, or } from 'drizzle-orm';
import type { Config, OAuthClient } from '../config.js';
import { hashToken, newToken } from '../auth/tokens.js';
import type { Db, DbOrTx, Tx } from '../db/client.js';
import { one } from '../db/rows.js';
import { oauthCodes, oauthGrants, sessions } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  GRANT_IDLE_MS,
  REFRESH_GRACE_MS,
  USED_CODE_KEEP_MS,
  connectorResource,
  oauthClients,
  oauthIssuer,
} from './settings.js';

/** PKCE S256 challenge: base64url of a SHA-256 (43 chars). */
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
/** RFC 7636 §4.1 code verifier. */
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;

const sameResource = (given: string, expected: string) =>
  given === expected || given === `${expected}/`;

export interface AuthorizeRequest {
  clientId: string;
  client: OAuthClient;
  redirectUri: string;
  codeChallenge: string;
  resource: string;
  state: string | undefined;
}

/**
 * Checks an authorization request. The client and the redirect URI come first: until both are
 * known good nothing may be sent anywhere, so every failure here is an error for the consent
 * page to show, never a redirect.
 */
export function validateAuthorize(config: Config, params: OAuthAuthorizeParams): AuthorizeRequest {
  const client = oauthClients(config).get(params.clientId);
  if (!client) {
    throw httpError(400, 'OAUTH_INVALID_CLIENT', 'This app is not allowed to connect to Kite');
  }
  // Exact string match against the pinned list: no prefixes, no normalizing.
  if (!client.redirectUris.includes(params.redirectUri)) {
    throw httpError(400, 'OAUTH_INVALID_REDIRECT', 'The redirect address does not match the app');
  }
  const invalid = (message: string) => httpError(400, 'OAUTH_INVALID_REQUEST', message);
  if (params.responseType !== 'code') throw invalid('response_type must be "code"');
  if (params.codeChallengeMethod !== 'S256') throw invalid('code_challenge_method must be S256');
  if (!params.codeChallenge || !CHALLENGE.test(params.codeChallenge)) {
    throw invalid('code_challenge must be a PKCE S256 challenge');
  }
  const resource = connectorResource(config);
  if (params.resource !== undefined && !sameResource(params.resource, resource)) {
    throw invalid('resource must be this server’s connector address');
  }
  return {
    clientId: params.clientId,
    client,
    redirectUri: params.redirectUri,
    codeChallenge: params.codeChallenge,
    resource,
    state: params.state,
  };
}

/** The redirect back to the client: `code` or `error`, plus `state` and `iss` (RFC 9207). */
export function redirectBack(
  config: Config,
  request: AuthorizeRequest,
  result: { code: string } | { error: string },
): string {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(result)) url.searchParams.set(key, value);
  if (request.state !== undefined) url.searchParams.set('state', request.state);
  url.searchParams.set('iss', oauthIssuer(config));
  return url.toString();
}

/** Makes a single-use authorization code for the person who clicked Allow. */
export async function issueCode(
  db: DbOrTx,
  userId: string,
  request: AuthorizeRequest,
  now = new Date(),
): Promise<string> {
  const code = newToken();
  await db.insert(oauthCodes).values({
    codeHash: hashToken(code),
    userId,
    clientId: request.clientId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    resource: request.resource,
    expiresAt: new Date(now.getTime() + CODE_TTL_MS),
  });
  return code;
}

export type TokenResult =
  { ok: true; tokens: OAuthTokenResponse } | { ok: false; status: 400; body: OAuthError };

const fail = (error: string, description: string): TokenResult => ({
  ok: false,
  status: 400,
  body: { error, error_description: description },
});

const invalidGrant = () => fail('invalid_grant', 'The code or refresh token is not valid');

function verifierMatches(verifier: string, challenge: string): boolean {
  const digest = createHash('sha256').update(verifier).digest('base64url');
  const a = Buffer.from(digest);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A fresh one-hour access token for the grant. */
async function addAccessToken(
  tx: Tx,
  grant: { id: string; userId: string; clientName: string },
  now: Date,
): Promise<string> {
  const token = newToken();
  await tx.insert(sessions).values({
    id: hashToken(token),
    userId: grant.userId,
    client: 'connector',
    grantId: grant.id,
    deviceLabel: grant.clientName,
    expiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
    lastSeenAt: now,
  });
  return token;
}

const tokens = (accessToken: string, refreshToken: string): OAuthTokenResponse => ({
  access_token: accessToken,
  token_type: 'Bearer',
  expires_in: ACCESS_TTL_MS / 1000,
  refresh_token: refreshToken,
});

/**
 * `grant_type=authorization_code`: the code must be unused, unexpired, and presented by the same
 * client with the same redirect URI and the PKCE verifier of its challenge. A code seen twice
 * ends the sign-in the first use made (someone else has the code).
 */
async function exchangeCode(
  db: Db,
  config: Config,
  body: OAuthTokenRequest,
  now: Date,
): Promise<TokenResult> {
  const { code, code_verifier: verifier, client_id: clientId, redirect_uri: redirectUri } = body;
  if (!code || !verifier || !clientId || !redirectUri) {
    return fail('invalid_request', 'code, code_verifier, client_id and redirect_uri are required');
  }
  const client = oauthClients(config).get(clientId);
  if (!client) return fail('invalid_client', 'Unknown client');
  if (body.resource !== undefined && !sameResource(body.resource, connectorResource(config))) {
    return fail('invalid_target', 'resource must be this server’s connector address');
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(oauthCodes)
      .where(eq(oauthCodes.codeHash, hashToken(code)))
      .for('update');
    if (!row) return invalidGrant();
    if (row.usedAt) {
      if (row.grantId) await tx.delete(oauthGrants).where(eq(oauthGrants.id, row.grantId));
      return invalidGrant();
    }
    if (
      row.expiresAt <= now ||
      row.clientId !== clientId ||
      row.redirectUri !== redirectUri ||
      !VERIFIER.test(verifier) ||
      !verifierMatches(verifier, row.codeChallenge)
    ) {
      return invalidGrant();
    }

    const refreshToken = newToken();
    const grant = one(
      await tx
        .insert(oauthGrants)
        .values({
          userId: row.userId,
          clientId,
          clientName: client.name,
          resource: row.resource,
          refreshHash: hashToken(refreshToken),
          lastUsedAt: now,
          expiresAt: new Date(now.getTime() + GRANT_IDLE_MS),
        })
        .returning(),
      'grant',
    );
    await tx
      .update(oauthCodes)
      .set({ usedAt: now, grantId: grant.id })
      .where(eq(oauthCodes.codeHash, row.codeHash));
    return { ok: true, tokens: tokens(await addAccessToken(tx, grant, now), refreshToken) };
  });
}

/**
 * `grant_type=refresh_token`: rotates the refresh token under the grant's row lock and adds a new
 * access token. The previous access token is left to run out (Claude refreshes minutes early,
 * while a tool call may still be using it); expired ones of this grant are cleared here.
 */
async function refresh(db: Db, body: OAuthTokenRequest, now: Date): Promise<TokenResult> {
  const { refresh_token: refreshToken, client_id: clientId } = body;
  if (!refreshToken || !clientId) {
    return fail('invalid_request', 'refresh_token and client_id are required');
  }
  const hash = hashToken(refreshToken);

  return db.transaction(async (tx) => {
    const [grant] = await tx
      .select()
      .from(oauthGrants)
      .where(or(eq(oauthGrants.refreshHash, hash), eq(oauthGrants.prevRefreshHash, hash)))
      .for('update');
    if (!grant) return invalidGrant();

    if (grant.refreshHash !== hash) {
      // The token from before the last rotation. Soon after, two refreshes raced; later, it leaked.
      const rotatedAt = grant.rotatedAt?.getTime() ?? 0;
      if (now.getTime() - rotatedAt > REFRESH_GRACE_MS) {
        await tx.delete(oauthGrants).where(eq(oauthGrants.id, grant.id));
      }
      return invalidGrant();
    }
    if (grant.expiresAt <= now) {
      await tx.delete(oauthGrants).where(eq(oauthGrants.id, grant.id));
      return invalidGrant();
    }
    if (grant.clientId !== clientId) return invalidGrant();

    const next = newToken();
    await tx
      .update(oauthGrants)
      .set({
        refreshHash: hashToken(next),
        prevRefreshHash: hash,
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: new Date(now.getTime() + GRANT_IDLE_MS),
      })
      .where(eq(oauthGrants.id, grant.id));
    await tx
      .delete(sessions)
      .where(and(eq(sessions.grantId, grant.id), lt(sessions.expiresAt, now)));
    return { ok: true, tokens: tokens(await addAccessToken(tx, grant, now), next) };
  });
}

/** The token endpoint. Never throws for a bad request: OAuth errors are part of the result. */
export function issueTokens(
  db: Db,
  config: Config,
  body: OAuthTokenRequest,
  now = new Date(),
): Promise<TokenResult> {
  if (body.grant_type === 'authorization_code') return exchangeCode(db, config, body, now);
  if (body.grant_type === 'refresh_token') return refresh(db, body, now);
  return Promise.resolve(
    fail('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token'),
  );
}

/** Ids of a grant's access sessions (their hashes), to close any sockets after it is deleted. */
async function grantSessionIds(db: DbOrTx, grantId: string): Promise<string[]> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.grantId, grantId));
  return rows.map((row) => row.id);
}

/** Deletes a sign-in and its access tokens; returns the ended session ids. */
export async function deleteGrant(db: Db, grantId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const ended = await grantSessionIds(tx, grantId);
    await tx.delete(oauthGrants).where(eq(oauthGrants.id, grantId));
    return ended;
  });
}

/**
 * RFC 7009: ends the sign-in a refresh or access token belongs to. Unknown tokens are not an
 * error. Returns the ended session ids, or null when the token matched nothing.
 */
export async function revokeToken(db: Db, token: string): Promise<string[] | null> {
  const hash = hashToken(token);
  const [byRefresh] = await db
    .select({ id: oauthGrants.id })
    .from(oauthGrants)
    .where(eq(oauthGrants.refreshHash, hash));
  const [byAccess] = byRefresh
    ? []
    : await db.select({ id: sessions.grantId }).from(sessions).where(eq(sessions.id, hash));
  const grantId = byRefresh?.id ?? byAccess?.id;
  return grantId ? deleteGrant(db, grantId) : null;
}

/** Hourly: expired sign-ins, their run-out access tokens, and codes past recognition. */
export async function removeExpiredOAuthRows(db: DbOrTx, now: Date): Promise<void> {
  await db.delete(oauthGrants).where(lt(oauthGrants.expiresAt, now));
  await db
    .delete(sessions)
    .where(and(eq(sessions.client, 'connector'), lt(sessions.expiresAt, now)));
  await db
    .delete(oauthCodes)
    .where(lt(oauthCodes.expiresAt, new Date(now.getTime() - USED_CODE_KEEP_MS)));
}
