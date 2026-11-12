/**
 * The remote Claude connector: Streamable HTTP at `POST /mcp`, stateless. Every request carries
 * a connector access token from Kite's OAuth server (apps/api, `/oauth/*`); the server checks it
 * was issued for this address, then runs the same tools as the stdio server with that token.
 *
 * Kite's MCP endpoint and its REST API are one resource server (same deployment, same issuer),
 * so using the caller's token on the API is not passing it to a third party; tokens that are not
 * connector tokens for this address never get that far.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { oauthTokenInfoSchema } from '@kite/shared';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ConfigError } from './config.js';
import { Kite } from './kite.js';
import { SERVER_VERSION, createServer } from './server.js';

export interface HttpConfig {
  /** Where the Kite API is reached from here (inside the deployment), no trailing slash. */
  apiBaseUrl: string;
  /** The address people open Kite at, with any sub-path, no trailing slash. */
  publicUrl: string;
  host: string;
  port: number;
  /** Browser origins allowed to call the endpoint, besides `publicUrl`'s own. */
  allowedOrigins: string[];
}

const DEFAULT_ORIGINS = ['https://claude.ai', 'https://claude.com'];

/** A setting's value, or undefined when unset or blank. */
function setting(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function plainUrl(name: string, raw: string | undefined, fallback?: string): string {
  const value = setting(raw) ?? fallback;
  if (!value) throw new ConfigError(`${name} is not set.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name} is not a URL: ${value}`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`${name} must start with http:// or https://`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ConfigError(`${name} must be a plain address (no credentials, query or #).`);
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * `KITE_PUBLIC_URL` (the web address, e.g. `https://host/task-manager`), `KITE_API_URL` (how to
 * reach the API from here; defaults to the public address), `PORT`, `HOST`, and optional
 * `MCP_ALLOWED_ORIGINS` (comma separated).
 */
export function readHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const publicUrl = plainUrl('KITE_PUBLIC_URL', env.KITE_PUBLIC_URL);
  const port = Number(setting(env.PORT) ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ConfigError('PORT must be a port number.');
  }
  return {
    publicUrl,
    apiBaseUrl: plainUrl('KITE_API_URL', env.KITE_API_URL, publicUrl),
    host: setting(env.HOST) ?? '127.0.0.1',
    port,
    allowedOrigins: (env.MCP_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

/** The connector address: what people add in Claude and what every token is issued for. */
export const resourceUrl = (config: Pick<HttpConfig, 'publicUrl'>) => `${config.publicUrl}/mcp`;

/** Where a client finds the authorization server (RFC 9728); sent with every 401. */
export const resourceMetadataUrl = (config: Pick<HttpConfig, 'publicUrl'>) =>
  `${config.publicUrl}/api/v1/oauth/resource-metadata`;

const BEARER = /^Bearer ([A-Za-z0-9_-]{43})$/i;
const MAX_BODY_BYTES = 1024 * 1024;

export interface HttpOptions {
  fetch?: typeof fetch;
  /** One line per request and refusal; never a token. Defaults to stderr. */
  log?: (message: string) => void;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(text);
}

/** A JSON-RPC error with no request id, as the transport itself answers protocol errors. */
const rpcError = (code: number, message: string) => ({
  jsonrpc: '2.0',
  error: { code, message },
  id: null,
});

class BodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BodyError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BodyError(400, 'Request body is not JSON');
  }
}

type TokenCheck = 'ok' | 'rejected' | 'unavailable';

/** The Node request handler; `http.createServer(createHttpHandler(config))`. */
export function createHttpHandler(config: HttpConfig, options: HttpOptions = {}) {
  const fetchImpl = options.fetch ?? fetch;
  const log = options.log ?? ((m: string) => process.stderr.write(`[kite-mcp] ${m}\n`));
  const resource = resourceUrl(config);
  const origins = new Set([
    new URL(config.publicUrl).origin,
    ...DEFAULT_ORIGINS,
    ...config.allowedOrigins,
  ]);

  /**
   * Whether the API knows this token as a connector access token issued for this address. An
   * extension token, a web or mobile session, or a token for another address is refused.
   */
  async function checkToken(token: string): Promise<TokenCheck> {
    let response: Response;
    try {
      response = await fetchImpl(`${config.apiBaseUrl}/api/v1/oauth/token-info`, {
        headers: { authorization: `Bearer ${token}`, 'user-agent': `kite-mcp/${SERVER_VERSION}` },
      });
    } catch {
      return 'unavailable';
    }
    if (response.status === 401) return 'rejected';
    if (!response.ok) return 'unavailable';
    const info = oauthTokenInfoSchema.safeParse(await response.json().catch(() => null));
    if (!info.success) return 'unavailable';
    return info.data.client === 'connector' && info.data.resource === resource ? 'ok' : 'rejected';
  }

  /** RFC 6750 §3 + RFC 9728 §5.1: tells the client where to sign in. */
  function unauthorized(res: ServerResponse, error?: string): void {
    const challenge = [
      ...(error ? [`error="invalid_token"`, `error_description="${error}"`] : []),
      `resource_metadata="${resourceMetadataUrl(config)}"`,
    ].join(', ');
    sendJson(
      res,
      401,
      {
        error: error ? 'invalid_token' : 'unauthorized',
        error_description: error ?? 'Sign in required',
      },
      { 'www-authenticate': `Bearer ${challenge}` },
    );
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = Date.now();
    const trimmed = new URL(req.url ?? '/', 'http://local').pathname.replace(/\/+$/, '');
    const path = trimmed === '' ? '/' : trimmed;
    const done = (note = '') => {
      log(`${req.method ?? '?'} ${path} ${res.statusCode}${note} ${Date.now() - started}ms`);
    };
    try {
      if (path === '/health') {
        sendJson(res, 200, { status: 'ok', version: SERVER_VERSION });
        return;
      }
      if (path !== '/mcp') {
        sendJson(res, 404, rpcError(-32000, 'Not found'));
        done();
        return;
      }
      // Browsers send Origin; a page on another site must not drive this endpoint (MCP spec).
      const { origin } = req.headers;
      if (origin !== undefined && !origins.has(origin)) {
        sendJson(res, 403, rpcError(-32000, 'Origin not allowed'));
        done(` origin=${origin}`);
        return;
      }
      // Stateless: no stream to open (GET) and no session to end (DELETE).
      if (req.method !== 'POST') {
        sendJson(res, 405, rpcError(-32000, 'Method not allowed'), { allow: 'POST' });
        done();
        return;
      }
      const header = req.headers.authorization;
      const token = BEARER.exec(header ?? '')?.[1];
      if (!token) {
        unauthorized(res, header ? 'The access token is malformed' : undefined);
        done();
        return;
      }
      const check = await checkToken(token);
      if (check === 'rejected') {
        unauthorized(res, 'The access token is invalid or expired');
        done();
        return;
      }
      if (check === 'unavailable') {
        sendJson(res, 503, rpcError(-32000, 'Kite is not reachable right now'), {
          'retry-after': '5',
        });
        done();
        return;
      }

      const body = await readJson(req);
      const kite = new Kite(
        { baseUrl: config.publicUrl, apiBaseUrl: config.apiBaseUrl, token, workspace: undefined },
        { fetch: fetchImpl, userAgent: `kite-mcp/${SERVER_VERSION}` },
      );
      // One server and transport per request: nothing is kept between requests or shared
      // between people.
      const server = createServer(kite);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      done();
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof BodyError) sendJson(res, err.status, rpcError(-32700, err.message));
        else sendJson(res, 500, rpcError(-32603, 'Internal error'));
      } else {
        res.end();
      }
      done(
        err instanceof BodyError ? '' : ` error=${err instanceof Error ? err.message : 'unknown'}`,
      );
    }
  };
}
