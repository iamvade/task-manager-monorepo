#!/usr/bin/env node
/**
 * End-to-end run of the remote connector against a running Kite (API + MCP HTTP server behind
 * one address), as a scripted OAuth client. It does what Claude does, except that it signs in
 * and clicks Allow through the API instead of a browser.
 *
 *   KITE_URL=http://localhost:5173 EMAIL=anu@kite.test PASSWORD=password123 \
 *     node apps/mcp/scripts/oauth-e2e.mjs
 *
 * The API needs CONNECTOR_ENABLED=true and this client in OAUTH_EXTRA_CLIENTS:
 *   {"kite-e2e-client":{"name":"E2E client","redirectUris":["http://127.0.0.1:8976/callback"]}}
 * Never run it against production: it creates and revokes sign-ins on the account.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
} from '@modelcontextprotocol/sdk/client/auth.js';

const KITE_URL = (process.env.KITE_URL ?? 'http://localhost:5173').replace(/\/+$/, '');
const EMAIL = process.env.EMAIL ?? 'anu@kite.test';
const PASSWORD = process.env.PASSWORD ?? 'password123';
const CLIENT_ID = process.env.CLIENT_ID ?? 'kite-e2e-client';
const REDIRECT_URI = process.env.REDIRECT_URI ?? 'http://127.0.0.1:8976/callback';
const MCP_URL = `${KITE_URL}/mcp`;
const ORIGIN = new URL(KITE_URL).origin;

let step = 0;
const ok = (message) => console.log(`  ok ${String(++step).padStart(2)}  ${message}`);
function check(condition, message) {
  if (!condition) throw new Error(`FAILED: ${message}`);
  ok(message);
}

const rpc = (headers = {}) =>
  fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });

const form = (path, fields) =>
  fetch(`${KITE_URL}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });

/** Signs in and clicks Allow, as the person would in the browser; returns the tokens. */
async function connect(metadata, resource) {
  const login = await fetch(`${KITE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!login.ok) throw new Error(`sign-in failed: ${login.status} ${await login.text()}`);
  const cookie = (login.headers.getSetCookie()[0] ?? '').split(';')[0];

  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(8).toString('hex');
  const approve = await fetch(`${KITE_URL}/api/v1/oauth/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: 'code',
      codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      codeChallengeMethod: 'S256',
      state,
      resource,
      approve: true,
    }),
  });
  if (!approve.ok) throw new Error(`authorize failed: ${approve.status} ${await approve.text()}`);
  const back = new URL((await approve.json()).redirectTo);
  if (`${back.origin}${back.pathname}` !== REDIRECT_URI) throw new Error('wrong redirect URI');
  if (back.searchParams.get('state') !== state) throw new Error('state was not returned');
  if (back.searchParams.get('iss') !== metadata.issuer) throw new Error('iss is not the issuer');
  const code = back.searchParams.get('code');

  const issued = await fetch(metadata.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      resource,
    }),
  });
  if (!issued.ok) throw new Error(`token failed: ${issued.status} ${await issued.text()}`);
  return { tokens: await issued.json(), code, verifier };
}

async function mcpClient(accessToken) {
  const client = new Client({ name: 'kite-oauth-e2e', version: '0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  );
  return client;
}

async function main() {
  console.log(`Kite connector end-to-end: ${MCP_URL}`);

  // 1. No token: 401 that says where to sign in.
  const anonymous = await rpc();
  const challenge = anonymous.headers.get('www-authenticate') ?? '';
  const pointer = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
  check(anonymous.status === 401 && pointer, `no token → 401 with resource_metadata (${pointer})`);

  // 2. Discovery, with the SDK's own client code (what MCP clients run).
  const prm = await discoverOAuthProtectedResourceMetadata(MCP_URL, {
    resourceMetadataUrl: new URL(pointer),
  });
  check(prm.resource === MCP_URL, `protected resource metadata names ${prm.resource}`);
  const issuer = prm.authorization_servers?.[0];
  check(issuer === KITE_URL, `authorization server is ${issuer}`);
  const metadata = await discoverAuthorizationServerMetadata(issuer);
  check(metadata?.issuer === issuer, 'authorization server metadata found by the SDK’s discovery');
  check(
    metadata.code_challenge_methods_supported?.includes('S256') &&
      metadata.client_id_metadata_document_supported === true &&
      metadata.token_endpoint_auth_methods_supported?.includes('none') &&
      !metadata.registration_endpoint,
    'metadata: PKCE S256, CIMD, public clients, no registration endpoint',
  );
  const wellKnown = await discoverOAuthProtectedResourceMetadata(MCP_URL).catch(() => null);
  check(wellKnown?.resource === MCP_URL, 'well-known protected resource metadata resolves too');

  // 3. Sign in, Allow, exchange the code with PKCE.
  const first = await connect(metadata, prm.resource);
  check(
    first.tokens.token_type === 'Bearer' && first.tokens.expires_in === 3600,
    'code exchanged: one-hour access token and a refresh token',
  );

  // 4. Use the tools.
  const client = await mcpClient(first.tokens.access_token);
  const { tools } = await client.listTools();
  check(
    tools.length === 19 && !tools.some((t) => /delete|remove/i.test(t.name)),
    `tools/list: ${tools.length} tools, none deletes`,
  );
  const text = (result) => result.content.map((c) => c.text).join('\n');
  const workspaces = await client.callTool({ name: 'list_workspaces', arguments: {} });
  // The first slug listed: an account in several workspaces has to name one.
  const slug =
    /^- (\S+)/m.exec(text(workspaces))?.[1] ??
    /([a-z0-9]+(?:-[a-z0-9]+)+)/.exec(text(workspaces))?.[1];
  check(!workspaces.isError && slug, `list_workspaces answered (using ${slug})`);
  const mine = await client.callTool({ name: 'my_tasks', arguments: { workspace: slug } });
  check(!mine.isError && text(mine).length > 0, `my_tasks answered (${text(mine).split('\n')[0]})`);
  await client.close();

  // 5. A replayed code is refused and ends the sign-in it made.
  const replay = await form('/oauth/token', {
    grant_type: 'authorization_code',
    code: first.code,
    code_verifier: first.verifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
  });
  check(replay.status === 400, 'replayed code → invalid_grant');
  check(
    (await rpc({ authorization: `Bearer ${first.tokens.access_token}` })).status === 401,
    'and the sign-in it made is over (access token → 401)',
  );

  // 6. Sign in again; refresh rotates.
  const second = await connect(metadata, prm.resource);
  const refreshed = await form('/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: second.tokens.refresh_token,
    client_id: CLIENT_ID,
  });
  const next = await refreshed.json();
  check(
    refreshed.ok && next.refresh_token !== second.tokens.refresh_token,
    'refresh: new access token, refresh token rotated',
  );
  check(
    (await rpc({ authorization: `Bearer ${next.access_token}` })).status === 200,
    'new access token works',
  );
  const old = await form('/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: second.tokens.refresh_token,
    client_id: CLIENT_ID,
  });
  check(
    old.status === 400 && (await old.json()).error === 'invalid_grant',
    'old refresh token → invalid_grant',
  );

  // 7. Wrong kinds of request.
  check(
    (await rpc({ authorization: `Bearer ${'x'.repeat(43)}` })).status === 401,
    'unknown token → 401',
  );
  check(
    (await rpc({ authorization: `Bearer ${next.access_token}`, origin: 'https://evil.example' }))
      .status === 403,
    'foreign Origin → 403',
  );
  check(
    (await fetch(MCP_URL, { headers: { authorization: `Bearer ${next.access_token}` } })).status ===
      405,
    'GET → 405 (stateless)',
  );

  // 8. Revoke.
  const revoked = await form('/oauth/revoke', { token: next.refresh_token });
  check(revoked.status === 200, 'revoke → 200');
  const after = await rpc({ authorization: `Bearer ${next.access_token}` });
  check(
    after.status === 401 && (after.headers.get('www-authenticate') ?? '').includes('invalid_token'),
    'after revoke → 401 invalid_token',
  );
  console.log(`\nAll ${step} checks passed.`);
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
