import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ME } from '@kite/shared/testing';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createHttpHandler, readHttpConfig, type HttpConfig } from '../src/http-server.js';
import { useConnectorHints } from '../src/tooling.js';
import { BASE_ROUTES, TASK, fakeKite } from './harness.js';

const PUBLIC = 'https://kite.example/task-manager';
const RESOURCE = `${PUBLIC}/mcp`;
const CONNECTOR = 'c'.repeat(43);
const EXTENSION = 'e'.repeat(43);
const ELSEWHERE = 'o'.repeat(43);
const REVOKED = 'r'.repeat(43);
const CHALLENGE = `resource_metadata="${PUBLIC}/api/v1/oauth/resource-metadata"`;

/** What `/oauth/token-info` says about each test token. */
const TOKEN_INFO: Record<string, unknown> = {
  [CONNECTOR]: { client: 'connector', resource: RESOURCE },
  [EXTENSION]: { client: 'mcp', resource: null },
  [ELSEWHERE]: { client: 'connector', resource: 'https://other.example/mcp' },
};

let servers: Server[] = [];
let clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
  await Promise.all(servers.map((s) => new Promise((done) => s.close(done))));
  servers = [];
  clients = [];
});

async function start(
  routes: Record<string, (body: unknown) => unknown> = {},
  over: Partial<HttpConfig> = {},
) {
  const logs: string[] = [];
  let lastAuth: string | null = null;
  const api = fakeKite({ ...BASE_ROUTES, ...routes });
  // token-info answers by the bearer token, which the route table can't see.
  const fetchImpl: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    lastAuth = new Headers(init?.headers).get('authorization');
    if (url.pathname === '/api/v1/oauth/token-info') {
      api.calls.push({
        method: 'GET',
        path: '/oauth/token-info',
        query: '',
        body: undefined,
        auth: lastAuth,
      });
      const info = TOKEN_INFO[lastAuth?.slice('Bearer '.length) ?? ''];
      return Promise.resolve(
        info
          ? Response.json({ ...info, expiresAt: '2026-11-12T05:00:00.000Z' })
          : Response.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
      );
    }
    return api.fetchImpl(input, init);
  };
  const config: HttpConfig = {
    publicUrl: PUBLIC,
    apiBaseUrl: 'http://api.internal:3000',
    host: '127.0.0.1',
    port: 0,
    allowedOrigins: [],
    ...over,
  };
  const handler = createHttpHandler(config, { fetch: fetchImpl, log: (m) => logs.push(m) });
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  servers.push(server);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;

  const post = (
    headers: Record<string, string> = {},
    body: unknown = { jsonrpc: '2.0', id: 1, method: 'ping' },
  ) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  async function connect(token = CONNECTOR) {
    const client = new Client({ name: 'test', version: '0' });
    clients.push(client);
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { authorization: `Bearer ${token}` } },
      }),
    );
    return client;
  }

  return { url, post, connect, logs, calls: api.calls };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('remote connector: HTTP server', () => {
  beforeAll(() => {
    useConnectorHints();
  });

  it('answers 401 with where to sign in when there is no token', async () => {
    const { post, calls } = await start();
    const res = await post();
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe(`Bearer ${CHALLENGE}`);
    expect(calls).toEqual([]);
  });

  it('answers 401 invalid_token for a revoked, malformed or wrong-audience token', async () => {
    const { post, calls } = await start();
    for (const token of [REVOKED, EXTENSION, ELSEWHERE]) {
      const res = await post(bearer(token));
      expect(res.status, token).toBe(401);
      const challenge = res.headers.get('www-authenticate') ?? '';
      expect(challenge).toContain('error="invalid_token"');
      expect(challenge).toContain(CHALLENGE);
    }
    const malformed = await post({ authorization: 'Bearer short' });
    expect(malformed.status).toBe(401);
    // Nothing but the audience check ever reached the API.
    expect(calls.every((c) => c.path === '/oauth/token-info')).toBe(true);
  });

  it('is not an auth failure when Kite cannot be reached', async () => {
    const handler = createHttpHandler(
      {
        publicUrl: PUBLIC,
        apiBaseUrl: 'http://api.internal:3000',
        host: '',
        port: 0,
        allowedOrigins: [],
      },
      { fetch: () => Promise.reject(new TypeError('fetch failed')), log: () => undefined },
    );
    const server = createServer((req, res) => void handler(req, res));
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    servers.push(server);
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`, {
      method: 'POST',
      headers: { ...bearer(CONNECTOR), 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('www-authenticate')).toBeNull();
  });

  it('lists and runs the tools over stateless HTTP as the token’s owner', async () => {
    const { connect, calls } = await start();
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(19);
    expect(tools.some((t) => /delete|remove/i.test(t.name))).toBe(false);

    const res = await client.callTool({ name: 'list_workspaces', arguments: {} });
    const text = (res.content as { text: string }[]).map((c) => c.text).join('\n');
    expect(res.isError).not.toBe(true);
    expect(text).toContain(ME.workspaces[0]?.slug);
    // The caller's own token goes to the API, at the internal address.
    const api = calls.filter((c) => c.path !== '/oauth/token-info');
    expect(api.length).toBeGreaterThan(0);
    expect(api.every((c) => c.auth === `Bearer ${CONNECTOR}`)).toBe(true);
  });

  it('links to the public address, not the internal one', async () => {
    const { connect } = await start({ [`GET /tasks/${TASK.id}/comments`]: () => [] });
    const client = await connect();
    const res = await client.callTool({ name: 'get_task', arguments: { key: TASK.key } });
    const text = (res.content as { text: string }[]).map((c) => c.text).join('\n');
    expect(text).toContain(`${PUBLIC}/w/`);
    expect(text).not.toContain('api.internal');
  });

  it('tells the person to reconnect when Kite drops the sign-in mid-conversation', async () => {
    const { connect } = await start({
      'GET /auth/me': () =>
        Response.json({ error: { code: 'UNAUTHORIZED', message: 'x' } }, { status: 401 }),
    });
    const client = await connect();
    const res = await client.callTool({ name: 'list_workspaces', arguments: {} });
    const text = (res.content as { text: string }[]).map((c) => c.text).join('\n');
    expect(res.isError).toBe(true);
    expect(text).toMatch(/Reconnect Kite in Claude/);
    expect(text).not.toMatch(/KITE_TOKEN|Claude Desktop/);
  });

  it('keeps nothing between requests: no session id, GET and DELETE are 405', async () => {
    const { url, post } = await start();
    const init = await post(bearer(CONNECTOR), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'raw', version: '0' },
      },
    });
    expect(init.status).toBe(200);
    expect(init.headers.get('mcp-session-id')).toBeNull();
    expect(init.headers.get('content-type')).toContain('application/json');
    for (const method of ['GET', 'DELETE']) {
      const res = await fetch(url, { method, headers: bearer(CONNECTOR) });
      expect(res.status, method).toBe(405);
      expect(res.headers.get('allow')).toBe('POST');
    }
  });

  it('refuses a foreign Origin and accepts Claude’s, the public one and none', async () => {
    const { post, logs } = await start({}, { allowedOrigins: ['https://extra.example'] });
    const evil = await post({ ...bearer(CONNECTOR), origin: 'https://evil.example' });
    expect(evil.status).toBe(403);
    expect(logs.some((l) => l.includes('origin=https://evil.example'))).toBe(true);
    for (const origin of ['https://claude.ai', 'https://kite.example', 'https://extra.example']) {
      expect((await post({ ...bearer(CONNECTOR), origin })).status, origin).toBe(200);
    }
    expect((await post(bearer(CONNECTOR))).status).toBe(200);
  });

  it('rejects a body that is not JSON or is too large, and unknown paths', async () => {
    const { url, post } = await start();
    expect((await post(bearer(CONNECTOR), 'not json')).status).toBe(400);
    expect((await post(bearer(CONNECTOR), `"${'x'.repeat(1024 * 1024 + 10)}"`)).status).toBe(413);
    expect((await fetch(url.replace('/mcp', '/other'))).status).toBe(404);
    expect((await fetch(url.replace('/mcp', '/health'))).status).toBe(200);
  });

  it('never logs a token', async () => {
    const { connect, post, logs } = await start();
    const client = await connect();
    await client.callTool({ name: 'list_workspaces', arguments: {} });
    await post(bearer(REVOKED));
    expect(logs.length).toBeGreaterThan(0);
    for (const token of [CONNECTOR, REVOKED]) expect(logs.join('\n')).not.toContain(token);
  });
});

describe('readHttpConfig', () => {
  it('reads the public and internal addresses', () => {
    expect(
      readHttpConfig({
        KITE_PUBLIC_URL: 'https://kite.example/task-manager/',
        KITE_API_URL: 'http://api:3000',
        PORT: '3001',
        HOST: '0.0.0.0',
        MCP_ALLOWED_ORIGINS: 'https://a.example, https://b.example',
      }),
    ).toEqual({
      publicUrl: 'https://kite.example/task-manager',
      apiBaseUrl: 'http://api:3000',
      host: '0.0.0.0',
      port: 3001,
      allowedOrigins: ['https://a.example', 'https://b.example'],
    });
  });

  it('defaults the API to the public address and needs the public address', () => {
    expect(readHttpConfig({ KITE_PUBLIC_URL: 'http://localhost:5173' })).toMatchObject({
      apiBaseUrl: 'http://localhost:5173',
      port: 3001,
      host: '127.0.0.1',
    });
    expect(() => readHttpConfig({})).toThrow(/KITE_PUBLIC_URL/);
    expect(() => readHttpConfig({ KITE_PUBLIC_URL: 'https://h/?x=1' })).toThrow(/plain address/);
  });
});
