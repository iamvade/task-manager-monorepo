import { createHash, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import {
  oauthAuthorizeResultSchema,
  oauthGrantsSchema,
  oauthTokenResponseSchema,
  type OAuthTokenResponse,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { loadConfig } from '../src/config.js';
import { one } from '../src/db/rows.js';
import { oauthCodes, oauthGrants, sessions, users } from '../src/db/schema/index.js';
import { removeExpiredOAuthRows } from '../src/oauth/service.js';
import { CLAUDE_CLIENT_ID } from '../src/oauth/settings.js';
import { redactUrl } from '../src/logging.js';
import { PASSWORD, bearer, createUser, errorCode, loginMobile, randomIp } from './fixtures.js';
import { createTestApp } from './helpers.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const WEB = 'https://kite.example/task-manager';
const RESOURCE = `${WEB}/mcp`;
const DAY = 24 * 60 * 60 * 1000;

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

describe('remote connector: OAuth authorization server', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  const origin = new URL(WEB).origin;

  beforeAll(async () => {
    ctx = await createTestApp({ WEB_ORIGIN: WEB });
  });

  afterAll(async () => {
    await ctx.close();
  });

  const inject = (method: InjectOptions['method'], url: string, opts: InjectOptions = {}) =>
    ctx.app.inject({ ...opts, method, url: `/api/v1${url}` });

  /** `login` from the fixtures sends the default Origin; this app is served under a sub-path. */
  const cookieFor = async (email: string) => {
    const res = await inject('POST', '/auth/login', {
      headers: { origin },
      remoteAddress: randomIp(),
      payload: { email, password: PASSWORD },
    });
    const cookie = res.cookies.find((c) => c.name === 'kite_session');
    if (!cookie) throw new Error(`login failed: ${res.body}`);
    return `kite_session=${cookie.value}`;
  };

  const signIn = async () => {
    const user = await createUser(ctx.db);
    return { user, cookie: await cookieFor(user.email) };
  };

  const params = (challenge: string, over: Record<string, unknown> = {}) => ({
    clientId: CLAUDE_CLIENT_ID,
    redirectUri: REDIRECT,
    responseType: 'code',
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state: 'st-1',
    resource: RESOURCE,
    ...over,
  });

  const authorize = (cookie: string, body: Record<string, unknown>, headers = { origin }) =>
    inject('POST', '/oauth/authorize', { headers: { cookie, ...headers }, payload: body });

  const form = (fields: Record<string, string>, ip = randomIp()) => ({
    remoteAddress: ip,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams(fields).toString(),
  });

  const token = (fields: Record<string, string>, ip?: string) =>
    inject('POST', '/oauth/token', form(fields, ip));

  /** Allow as the user, returning the code from the redirect. */
  async function getCode(cookie: string, challenge: string) {
    const res = await authorize(cookie, { ...params(challenge), approve: true });
    expect(res.statusCode, res.body).toBe(200);
    const url = new URL(oauthAuthorizeResultSchema.parse(res.json()).redirectTo);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('no code');
    return { code, url };
  }

  const codeFields = (code: string, verifier: string) => ({
    grant_type: 'authorization_code',
    code,
    code_verifier: verifier,
    client_id: CLAUDE_CLIENT_ID,
    redirect_uri: REDIRECT,
    resource: RESOURCE,
  });

  async function connect() {
    const { user, cookie } = await signIn();
    const { verifier, challenge } = pkce();
    const { code } = await getCode(cookie, challenge);
    const res = await token(codeFields(code, verifier));
    expect(res.statusCode, res.body).toBe(200);
    return { user, cookie, code, verifier, tokens: oauthTokenResponseSchema.parse(res.json()) };
  }

  const refresh = (refreshToken: string, ip?: string) =>
    token(
      { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: CLAUDE_CLIENT_ID },
      ip,
    );

  const me = (accessToken: string) => inject('GET', '/auth/me', { headers: bearer(accessToken) });

  const grantOf = async (userId: string) =>
    (await ctx.db.select().from(oauthGrants).where(eq(oauthGrants.userId, userId)))[0];

  describe('metadata', () => {
    it('describes the server with the sub-path issuer and no registration endpoint', async () => {
      const res = await inject('GET', '/oauth/metadata');
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        issuer: WEB,
        authorization_endpoint: `${WEB}/oauth/authorize`,
        token_endpoint: `${WEB}/api/v1/oauth/token`,
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        client_id_metadata_document_supported: true,
        authorization_response_iss_parameter_supported: true,
      });
      expect(res.json()).not.toHaveProperty('registration_endpoint');
    });

    it('names the connector address and its authorization server', async () => {
      const res = await inject('GET', '/oauth/resource-metadata');
      expect(res.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [WEB] });
    });

    it('does not exist when the connector is off', async () => {
      const off = await createTestApp({ CONNECTOR_ENABLED: false });
      try {
        const res = await off.app.inject({ method: 'GET', url: '/api/v1/oauth/metadata' });
        expect(res.statusCode).toBe(404);
      } finally {
        await off.close();
      }
    });
  });

  describe('authorize', () => {
    it('tells the consent page who is asking', async () => {
      const { cookie } = await signIn();
      const res = await inject('POST', '/oauth/authorize/check', {
        headers: { cookie, origin },
        payload: params(pkce().challenge),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json()).toEqual({ clientName: 'Claude', redirectHost: 'claude.ai' });
    });

    it('never redirects for an unknown client or a redirect URI that is not exact', async () => {
      const { cookie } = await signIn();
      const { challenge } = pkce();
      const unknown = await authorize(cookie, {
        ...params(challenge, { clientId: 'https://evil.example/client' }),
        approve: true,
      });
      expect(unknown.statusCode).toBe(400);
      expect(errorCode(unknown)).toBe('OAUTH_INVALID_CLIENT');
      expect(unknown.json()).not.toHaveProperty('redirectTo');

      for (const redirectUri of [
        `${REDIRECT}/extra`,
        `${REDIRECT}?next=https://evil.example`,
        REDIRECT.toUpperCase(),
        'https://claude.ai.evil.example/api/mcp/auth_callback',
        'https://evil.example/cb',
      ]) {
        const res = await authorize(cookie, {
          ...params(challenge, { redirectUri }),
          approve: true,
        });
        expect(res.statusCode, redirectUri).toBe(400);
        expect(errorCode(res)).toBe('OAUTH_INVALID_REDIRECT');
        expect(res.json()).not.toHaveProperty('redirectTo');
      }
    });

    it('requires PKCE S256, response_type=code and this resource', async () => {
      const { cookie } = await signIn();
      const { challenge } = pkce();
      for (const over of [
        { codeChallenge: undefined },
        { codeChallengeMethod: 'plain' },
        { codeChallengeMethod: undefined },
        { codeChallenge: 'short' },
        { responseType: 'token' },
        { resource: 'https://other.example/mcp' },
      ]) {
        const res = await authorize(cookie, { ...params(challenge, over), approve: true });
        expect(res.statusCode, JSON.stringify(over)).toBe(400);
        expect(errorCode(res)).toBe('OAUTH_INVALID_REQUEST');
      }
      // No resource at all means the one resource.
      const res = await authorize(cookie, {
        ...params(challenge, { resource: undefined }),
        approve: true,
      });
      expect(res.statusCode).toBe(200);
    });

    it('sends the code back with state and the exact issuer, storing only its hash', async () => {
      const { user, cookie } = await signIn();
      const { code, url } = await getCode(cookie, pkce().challenge);
      expect(`${url.origin}${url.pathname}`).toBe(REDIRECT);
      expect(url.searchParams.get('state')).toBe('st-1');
      expect(url.searchParams.get('iss')).toBe(WEB);
      const row = one(
        await ctx.db
          .select()
          .from(oauthCodes)
          .where(eq(oauthCodes.codeHash, hashToken(code))),
      );
      expect(row).toMatchObject({ userId: user.id, clientId: CLAUDE_CLIENT_ID, usedAt: null });
      expect(row.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);
      expect(JSON.stringify(row)).not.toContain(code);
    });

    it('reports a refusal to the client and makes no code', async () => {
      const { user, cookie } = await signIn();
      const res = await authorize(cookie, { ...params(pkce().challenge), approve: false });
      const url = new URL(oauthAuthorizeResultSchema.parse(res.json()).redirectTo);
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('code')).toBeNull();
      expect(url.searchParams.get('state')).toBe('st-1');
      expect(await ctx.db.select().from(oauthCodes).where(eq(oauthCodes.userId, user.id))).toEqual(
        [],
      );
    });

    it('rejects a cross-site approval', async () => {
      const { cookie } = await signIn();
      const body = { ...params(pkce().challenge), approve: true };
      for (const headers of [{ origin: 'https://evil.example' }, {}]) {
        const res = await inject('POST', '/oauth/authorize', {
          headers: { cookie, ...headers },
          payload: body,
        });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('CSRF_REJECTED');
      }
    });

    it('needs a signed-in person', async () => {
      const res = await inject('POST', '/oauth/authorize', {
        headers: { origin },
        payload: { ...params(pkce().challenge), approve: true },
      });
      expect(res.statusCode).toBe(401);
    });

    it('cannot be approved or managed with a bearer token of any kind', async () => {
      const { user, cookie, tokens } = await connect();
      const mobile = await loginMobile(ctx.app, user.email);
      const grant = await grantOf(user.id);
      const body = { ...params(pkce().challenge), approve: true };
      for (const t of [mobile, tokens.access_token]) {
        const calls = [
          inject('POST', '/oauth/authorize', { headers: bearer(t), payload: body }),
          inject('POST', '/oauth/authorize/check', { headers: bearer(t), payload: body }),
          inject('GET', '/oauth/grants', { headers: bearer(t) }),
          inject('DELETE', `/oauth/grants/${grant?.id}`, { headers: bearer(t) }),
        ];
        for (const res of await Promise.all(calls)) {
          expect(res.statusCode, res.body).toBe(403);
          expect(errorCode(res)).toBe('COOKIE_SESSION_REQUIRED');
        }
      }
      expect((await inject('GET', '/oauth/grants', { headers: { cookie } })).statusCode).toBe(200);
    });

    it('refuses the platform admin', async () => {
      const { user, cookie } = await signIn();
      await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, user.id));
      const res = await authorize(cookie, { ...params(pkce().challenge), approve: true });
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
    });
  });

  describe('token', () => {
    it('exchanges a code for a one-hour connector session and a refresh token', async () => {
      const { user, tokens } = await connect();
      expect(tokens).toMatchObject({ token_type: 'Bearer', expires_in: 3600 });
      expect(tokens.access_token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const session = one(
        await ctx.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, hashToken(tokens.access_token))),
      );
      const grant = await grantOf(user.id);
      expect(session).toMatchObject({ userId: user.id, client: 'connector', grantId: grant?.id });
      expect(grant).toMatchObject({
        clientId: CLAUDE_CLIENT_ID,
        clientName: 'Claude',
        resource: RESOURCE,
        refreshHash: hashToken(tokens.refresh_token),
      });
      expect((await me(tokens.access_token)).statusCode).toBe(200);
    });

    it('sends no-store and accepts no JSON envelope errors for OAuth failures', async () => {
      const res = await token({ grant_type: 'password' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: 'unsupported_grant_type' });
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('refuses a wrong verifier, client, redirect URI or resource, and an expired code', async () => {
      const { cookie } = await signIn();
      const attempt = async (change: (f: Record<string, string>) => Record<string, string>) => {
        const { verifier, challenge } = pkce();
        const { code } = await getCode(cookie, challenge);
        return token(change(codeFields(code, verifier)));
      };
      const wrong = [
        (f: Record<string, string>) => ({ ...f, code_verifier: pkce().verifier }),
        (f: Record<string, string>) => ({ ...f, code_verifier: 'x' }),
        (f: Record<string, string>) => ({ ...f, redirect_uri: `${REDIRECT}/x` }),
        (f: Record<string, string>) => ({ ...f, code: `${f.code}x` }),
      ];
      for (const change of wrong) {
        const res = await attempt(change);
        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({ error: 'invalid_grant' });
      }
      const client = await attempt((f) => ({ ...f, client_id: 'https://evil.example/c' }));
      expect(client.json()).toMatchObject({ error: 'invalid_client' });
      const target = await attempt((f) => ({ ...f, resource: 'https://other.example/mcp' }));
      expect(target.json()).toMatchObject({ error: 'invalid_target' });
      const missing = await attempt(({ code_verifier: _v, ...f }) => f);
      expect(missing.json()).toMatchObject({ error: 'invalid_request' });

      const { verifier, challenge } = pkce();
      const { code } = await getCode(cookie, challenge);
      await ctx.db
        .update(oauthCodes)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(oauthCodes.codeHash, hashToken(code)));
      const expired = await token(codeFields(code, verifier));
      expect(expired.json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('ends the sign-in when a code is used twice', async () => {
      const { user, code, verifier, tokens } = await connect();
      const replay = await token(codeFields(code, verifier));
      expect(replay.statusCode).toBe(400);
      expect(replay.json()).toMatchObject({ error: 'invalid_grant' });
      expect(await grantOf(user.id)).toBeUndefined();
      expect((await me(tokens.access_token)).statusCode).toBe(401);
      expect((await refresh(tokens.refresh_token)).statusCode).toBe(400);
    });

    it('rotates the refresh token and keeps the old access token until it runs out', async () => {
      const { user, tokens } = await connect();
      const res = await refresh(tokens.refresh_token);
      expect(res.statusCode, res.body).toBe(200);
      const next = oauthTokenResponseSchema.parse(res.json());
      expect(next.refresh_token).not.toBe(tokens.refresh_token);
      expect(next.access_token).not.toBe(tokens.access_token);
      expect((await me(next.access_token)).statusCode).toBe(200);
      expect((await me(tokens.access_token)).statusCode).toBe(200);
      expect(await grantOf(user.id)).toMatchObject({
        refreshHash: hashToken(next.refresh_token),
        prevRefreshHash: hashToken(tokens.refresh_token),
      });
    });

    it('only refuses the old refresh token within a minute, and ends the sign-in after it', async () => {
      const { user, tokens } = await connect();
      const next = oauthTokenResponseSchema.parse((await refresh(tokens.refresh_token)).json());
      const grant = await grantOf(user.id);
      if (!grant) throw new Error('expected a grant');

      await ctx.db
        .update(oauthGrants)
        .set({ rotatedAt: new Date(Date.now() - 30_000) })
        .where(eq(oauthGrants.id, grant.id));
      const raced = await refresh(tokens.refresh_token);
      expect(raced.json()).toMatchObject({ error: 'invalid_grant' });
      expect(await grantOf(user.id)).toBeDefined();
      expect((await me(next.access_token)).statusCode).toBe(200);

      await ctx.db
        .update(oauthGrants)
        .set({ rotatedAt: new Date(Date.now() - 90_000) })
        .where(eq(oauthGrants.id, grant.id));
      const leaked = await refresh(tokens.refresh_token);
      expect(leaked.json()).toMatchObject({ error: 'invalid_grant' });
      expect(await grantOf(user.id)).toBeUndefined();
      expect((await me(next.access_token)).statusCode).toBe(401);
      expect((await refresh(next.refresh_token)).json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('refuses a refresh by another client and one after 30 idle days', async () => {
      const { user, tokens } = await connect();
      const other = await token({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
        client_id: 'https://evil.example/c',
      });
      expect(other.json()).toMatchObject({ error: 'invalid_grant' });
      expect(await grantOf(user.id)).toBeDefined();

      await ctx.db
        .update(oauthGrants)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(oauthGrants.userId, user.id));
      expect((await refresh(tokens.refresh_token)).json()).toMatchObject({
        error: 'invalid_grant',
      });
      expect(await grantOf(user.id)).toBeUndefined();
    });

    it('never slides: the access token is gone after its hour however much it is used', async () => {
      const { tokens } = await connect();
      const id = hashToken(tokens.access_token);
      const before = one(await ctx.db.select().from(sessions).where(eq(sessions.id, id)));
      expect(before.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3600_000);
      await me(tokens.access_token);
      const after = one(await ctx.db.select().from(sessions).where(eq(sessions.id, id)));
      expect(after.expiresAt.getTime()).toBe(before.expiresAt.getTime());

      await ctx.db
        .update(sessions)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(sessions.id, id));
      expect((await me(tokens.access_token)).statusCode).toBe(401);
    });

    it('throttles failures per IP and never counts successes', async () => {
      const { tokens } = await connect();
      const ip = randomIp();
      let current: OAuthTokenResponse = tokens;
      for (let i = 0; i < 3; i += 1) {
        const res = await refresh(current.refresh_token, ip);
        expect(res.statusCode).toBe(200);
        current = oauthTokenResponseSchema.parse(res.json());
      }
      for (let i = 0; i < 30; i += 1) {
        expect((await refresh('nope', ip)).statusCode).toBe(400);
      }
      const blocked = await refresh('nope', ip);
      expect(blocked.statusCode).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect(blocked.json()).toMatchObject({ error: 'temporarily_unavailable' });
      // Another address (the rest of Claude's users) is unaffected.
      expect((await refresh(current.refresh_token)).statusCode).toBe(200);
    });

    it('is reachable from any Origin without a cookie, but not with one', async () => {
      const { cookie, tokens } = await connect();
      const foreign = await inject('POST', '/oauth/token', {
        ...form({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: CLAUDE_CLIENT_ID,
        }),
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          origin: 'https://claude.ai',
        },
      });
      expect(foreign.statusCode, foreign.body).toBe(200);
      const riding = await inject('POST', '/oauth/token', {
        headers: {
          cookie,
          origin: 'https://evil.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        payload: 'grant_type=refresh_token',
      });
      expect(riding.statusCode).toBe(403);
      expect(errorCode(riding)).toBe('CSRF_REJECTED');
    });

    it('form bodies are accepted only by the OAuth routes', async () => {
      const res = await inject('POST', '/auth/login', {
        remoteAddress: randomIp(),
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'email=a%40kite.test&password=x',
      });
      expect(res.statusCode).toBe(415);
    });
  });

  describe('sign-ins: list, revoke, reset', () => {
    it('lists my sign-ins with the connector address, not the access tokens as devices', async () => {
      const { cookie, tokens } = await connect();
      await refresh(tokens.refresh_token);
      const res = await inject('GET', '/oauth/grants', { headers: { cookie } });
      const body = oauthGrantsSchema.parse(res.json());
      expect(body.connectorUrl).toBe(RESOURCE);
      expect(body.grants).toHaveLength(1);
      expect(body.grants[0]).toMatchObject({ clientName: 'Claude' });

      const devices = (await inject('GET', '/auth/sessions', { headers: { cookie } })).json<
        { client: string }[]
      >();
      expect(devices.map((d) => d.client)).toEqual(['web']);
    });

    it('revoking from Settings ends every token of the sign-in at once', async () => {
      const { user, cookie, tokens } = await connect();
      const next = oauthTokenResponseSchema.parse((await refresh(tokens.refresh_token)).json());
      const grant = await grantOf(user.id);
      const del = await inject('DELETE', `/oauth/grants/${grant?.id}`, {
        headers: { cookie, origin },
      });
      expect(del.statusCode).toBe(204);
      expect((await me(tokens.access_token)).statusCode).toBe(401);
      expect((await me(next.access_token)).statusCode).toBe(401);
      expect((await refresh(next.refresh_token)).json()).toMatchObject({ error: 'invalid_grant' });
    });

    it('answers 404 for someone else’s sign-in', async () => {
      const mine = await connect();
      const other = await signIn();
      const grant = await grantOf(mine.user.id);
      const res = await inject('DELETE', `/oauth/grants/${grant?.id}`, {
        headers: { cookie: other.cookie, origin },
      });
      expect(res.statusCode).toBe(404);
      expect(await grantOf(mine.user.id)).toBeDefined();
    });

    it('the revoke endpoint ends the sign-in by refresh or access token, and is always 200', async () => {
      for (const pick of ['refresh_token', 'access_token'] as const) {
        const { user, tokens } = await connect();
        const res = await inject('POST', '/oauth/revoke', form({ token: tokens[pick] }));
        expect(res.statusCode, res.body).toBe(200);
        expect(await grantOf(user.id)).toBeUndefined();
        expect((await me(tokens.access_token)).statusCode).toBe(401);
      }
      const unknown = await inject('POST', '/oauth/revoke', form({ token: 'nope' }));
      expect(unknown.statusCode).toBe(200);
    });

    it('a password reset ends connector sign-ins', async () => {
      const { user, tokens } = await connect();
      const admin = await createUser(ctx.db);
      await ctx.db.update(users).set({ platformRole: 'vade' }).where(eq(users.id, admin.id));
      const adminCookie = await cookieFor(admin.email);
      const issued = await inject('POST', `/admin/users/${user.id}/password-reset`, {
        headers: { cookie: adminCookie, origin },
      });
      expect(issued.statusCode, issued.body).toBe(201);
      const link = issued.json<{ link: string }>().link;
      const resetToken = link.slice(link.lastIndexOf('/') + 1);
      const reset = await inject('POST', `/password-resets/${resetToken}`, {
        headers: { origin },
        payload: { password: 'a brand new password' },
      });
      expect(reset.statusCode, reset.body).toBe(204);
      expect(await grantOf(user.id)).toBeUndefined();
      expect((await me(tokens.access_token)).statusCode).toBe(401);
      expect((await refresh(tokens.refresh_token)).json()).toMatchObject({
        error: 'invalid_grant',
      });
    });

    it('token-info tells the MCP server what a session is', async () => {
      const { user, tokens } = await connect();
      const info = await inject('GET', '/oauth/token-info', {
        headers: bearer(tokens.access_token),
      });
      expect(info.json()).toMatchObject({ client: 'connector', resource: RESOURCE });
      const mobile = await loginMobile(ctx.app, user.email);
      const other = await inject('GET', '/oauth/token-info', { headers: bearer(mobile) });
      expect(other.json()).toMatchObject({ client: 'mobile', resource: null });
      expect((await inject('GET', '/oauth/token-info')).statusCode).toBe(401);
    });

    it('the cleanup removes expired sign-ins, run-out access tokens and old codes', async () => {
      const { user, tokens, code } = await connect();
      const past = new Date(Date.now() - 2 * DAY);
      await ctx.db.update(oauthCodes).set({ expiresAt: past });
      await ctx.db
        .update(sessions)
        .set({ expiresAt: past })
        .where(eq(sessions.id, hashToken(tokens.access_token)));
      await removeExpiredOAuthRows(ctx.db, new Date());
      expect(
        await ctx.db
          .select()
          .from(oauthCodes)
          .where(eq(oauthCodes.codeHash, hashToken(code))),
      ).toEqual([]);
      expect(
        await ctx.db
          .select()
          .from(sessions)
          .where(eq(sessions.id, hashToken(tokens.access_token))),
      ).toEqual([]);
      expect(await grantOf(user.id)).toBeDefined();
      await ctx.db
        .update(oauthGrants)
        .set({ expiresAt: past })
        .where(eq(oauthGrants.userId, user.id));
      await removeExpiredOAuthRows(ctx.db, new Date());
      expect(await grantOf(user.id)).toBeUndefined();
    });
  });

  describe('logs and config', () => {
    it('never logs a code, verifier or token', async () => {
      const lines: string[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _enc, next) {
          lines.push(chunk.toString());
          next();
        },
      });
      const logged = await createTestApp(
        { WEB_ORIGIN: WEB, LOG_LEVEL: 'debug' },
        { logStream: stream },
      );
      try {
        const user = await createUser(logged.db);
        const signedIn = await logged.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin },
          remoteAddress: randomIp(),
          payload: { email: user.email, password: 'correct horse battery' },
        });
        const cookie = `kite_session=${signedIn.cookies.find((c) => c.name === 'kite_session')?.value}`;
        const { verifier, challenge } = pkce();
        const approved = await logged.app.inject({
          method: 'POST',
          url: '/api/v1/oauth/authorize',
          headers: { cookie, origin },
          payload: { ...params(challenge), approve: true },
        });
        const code = new URL(approved.json<{ redirectTo: string }>().redirectTo).searchParams.get(
          'code',
        );
        if (!code) throw new Error('no code');
        const issued = await logged.app.inject({
          method: 'POST',
          url: `/api/v1/oauth/token?code=${code}`,
          ...form(codeFields(code, verifier)),
        });
        const t = oauthTokenResponseSchema.parse(issued.json());
        await logged.app.inject({
          method: 'POST',
          url: '/api/v1/oauth/token',
          ...form({
            grant_type: 'refresh_token',
            refresh_token: 'bad-token-value',
            client_id: 'x',
          }),
        });
        const output = lines.join('');
        expect(output).toContain('/oauth/token');
        for (const secret of [code, verifier, t.access_token, t.refresh_token, 'bad-token-value']) {
          expect(output).not.toContain(secret);
        }
      } finally {
        await logged.close();
      }
    });

    it('drops the query string of OAuth URLs from logs', () => {
      expect(redactUrl('/api/v1/oauth/token?code=abc&state=x')).toBe(
        '/api/v1/oauth/token?[redacted]',
      );
      expect(redactUrl('/api/v1/tasks?doneSince=2026-01-01')).toBe(
        '/api/v1/tasks?doneSince=2026-01-01',
      );
    });

    it('refuses unsafe extra clients', () => {
      const base = { ...process.env, NODE_ENV: 'production' };
      const withClients = (value: string, env: NodeJS.ProcessEnv = base) =>
        loadConfig({ ...env, OAUTH_EXTRA_CLIENTS: value });
      const client = (uri: string) => JSON.stringify({ c1: { name: 'Test', redirectUris: [uri] } });
      expect(() => withClients(client('http://127.0.0.1:9000/cb'))).toThrow(/OAUTH_EXTRA_CLIENTS/);
      expect(() => withClients(client('http://example.com/cb'))).toThrow(/OAUTH_EXTRA_CLIENTS/);
      expect(() => withClients(client('https://example.com/cb#frag'))).toThrow(
        /OAUTH_EXTRA_CLIENTS/,
      );
      expect(() => withClients('not json')).toThrow(/OAUTH_EXTRA_CLIENTS/);
      expect(withClients(client('https://example.com/cb')).OAUTH_EXTRA_CLIENTS).toBeDefined();
      expect(
        withClients(client('http://127.0.0.1:9000/cb'), { ...process.env, NODE_ENV: 'test' })
          .OAUTH_EXTRA_CLIENTS,
      ).toBeDefined();
    });

    it('accepts an extra client only at its own redirect URI', async () => {
      const extra = await createTestApp({
        WEB_ORIGIN: WEB,
        OAUTH_EXTRA_CLIENTS: JSON.stringify({
          'test-client': { name: 'Test client', redirectUris: ['http://127.0.0.1:8976/callback'] },
        }),
      });
      try {
        const user = await createUser(extra.db);
        const signedIn = await extra.app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin },
          remoteAddress: randomIp(),
          payload: { email: user.email, password: 'correct horse battery' },
        });
        const cookie = `kite_session=${signedIn.cookies.find((c) => c.name === 'kite_session')?.value}`;
        const check = (redirectUri: string) =>
          extra.app.inject({
            method: 'POST',
            url: '/api/v1/oauth/authorize/check',
            headers: { cookie, origin },
            payload: params(pkce().challenge, { clientId: 'test-client', redirectUri }),
          });
        expect((await check('http://127.0.0.1:8976/callback')).json()).toEqual({
          clientName: 'Test client',
          redirectHost: '127.0.0.1:8976',
        });
        // Claude's callback belongs to Claude's client id only.
        expect(errorCode(await check(REDIRECT))).toBe('OAUTH_INVALID_REDIRECT');
      } finally {
        await extra.close();
      }
    });
  });
});
