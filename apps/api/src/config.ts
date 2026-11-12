import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_ATTACHMENT_BYTES } from '@kite/shared';
import { z } from 'zod';

/**
 * `true`/`false`, a hop count (`1` = trust the nearest proxy only), or comma-separated proxy
 * addresses/CIDRs, as Fastify's `trustProxy` takes them. `true` trusts every X-Forwarded-For hop,
 * so only use it when the API can't be reached except through the proxy.
 */
const trustProxySchema = z
  .string()
  .trim()
  .default('false')
  .transform((value): boolean | number | string => {
    if (value === 'true') return true;
    if (value === 'false' || value === '') return false;
    if (/^\d+$/.test(value)) return Number(value);
    return value;
  });

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

export interface OAuthClient {
  name: string;
  /** Matched exactly; the only places an authorization code is ever sent. */
  redirectUris: string[];
}

const extraClientsSchema = z.record(
  z.string().min(1).max(2048),
  z.object({
    name: z.string().trim().min(1).max(80),
    redirectUris: z.array(z.string().max(2048)).min(1),
  }),
);

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Whether a client may be sent back to this URI: https, or http on loopback outside production. */
function redirectUriAllowed(value: string, production: boolean): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === 'https:') return true;
  return !production && url.protocol === 'http:' && LOOPBACK.has(url.hostname);
}

/** `OAUTH_EXTRA_CLIENTS` parsed; call only on a validated config. */
export function parseExtraClients(raw: string | undefined): Record<string, OAuthClient> {
  return raw ? extraClientsSchema.parse(JSON.parse(raw)) : {};
}

function extraClientsProblem(raw: string, production: boolean): string | null {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return 'Must be JSON: {"<client id>": {"name": "...", "redirectUris": ["https://..."]}}';
  }
  const parsed = extraClientsSchema.safeParse(json);
  if (!parsed.success) {
    return 'Must be {"<client id>": {"name": "...", "redirectUris": ["https://..."]}}';
  }
  for (const [clientId, client] of Object.entries(parsed.data)) {
    const bad = client.redirectUris.find((uri) => !redirectUriAllowed(uri, production));
    if (bad) {
      return `Client ${clientId}: redirect URI ${bad} must be https without a fragment${
        production ? '' : ' (or http on localhost)'
      }`;
    }
  }
  return null;
}

const envSchema = z
  .object({
    /** Required (no default) so a deploy that forgets it doesn't silently run in dev mode. */
    NODE_ENV: z.enum(['development', 'test', 'production']),
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url(),
    TEST_DATABASE_URL: z.url().optional(),
    /**
     * Where the web app is served: an origin, plus a path when it lives under one
     * (`https://host/task-manager`). CSRF, CORS and the socket compare the bare origin; the path
     * scopes the session cookie and goes into invite and password-reset links.
     */
    WEB_ORIGIN: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return !url.search && !url.hash;
      }, 'WEB_ORIGIN must be an origin, optionally with a path, without a query or hash')
      .default('http://localhost:5173'),
    /** Set when running behind a reverse proxy so `request.ip` (login throttle, logs) is the client's. */
    TRUST_PROXY: trustProxySchema,
    /** OpenAPI spec + Swagger UI at /api/docs. Unset = on everywhere except production. */
    API_DOCS: z.stringbool().optional(),
    /** Where attachment files live: `local` disk under `UPLOADS_DIR`, or an `s3` bucket. */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    /** Attachment files (local disk storage); relative paths resolve from the working directory. */
    UPLOADS_DIR: z.string().min(1).default('uploads'),
    /** S3 driver: bucket (required), region, optional endpoint for R2/MinIO/etc., key prefix. */
    S3_BUCKET: optionalString,
    S3_REGION: z.string().trim().min(1).default('us-east-1'),
    S3_ENDPOINT: optionalString.pipe(z.url().optional()),
    /** `true` for MinIO and most self-hosted S3 (bucket in the path, not the host name). */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    S3_PREFIX: optionalString,
    /** Both or neither; without them the AWS SDK's default credential chain applies. */
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    /** Largest accepted attachment, bytes. */
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(MAX_ATTACHMENT_BYTES),
    /** Total attachment bytes a workspace may store (default 5 GiB). */
    MAX_WORKSPACE_STORAGE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 1024 ** 3),
    /** How long computed reports are reused, ms; 0 turns the cache off. */
    REPORTS_CACHE_TTL_MS: z.coerce.number().int().min(0).default(300_000),
    /**
     * Web Push (VAPID) key pair from `pnpm --filter @kite/api push:keys`, and a contact URL the
     * push services can reach (`mailto:` or `https:`). All three or none; none = push is off.
     */
    VAPID_PUBLIC_KEY: optionalString,
    VAPID_PRIVATE_KEY: optionalString,
    VAPID_SUBJECT: optionalString.pipe(
      z
        .string()
        .regex(/^(mailto:|https:\/\/)/, 'Must start with mailto: or https://')
        .optional(),
    ),
    /**
     * The remote Claude connector: the OAuth routes (`/oauth/*`) that let people add Kite to
     * Claude by URL (`<WEB_ORIGIN>/mcp`) and sign in. Off = the routes do not exist.
     */
    CONNECTOR_ENABLED: z.stringbool().default(false),
    /**
     * More OAuth clients besides Claude's published identity, as JSON:
     * `{"<client id>": {"name": "...", "redirectUris": ["https://..."]}}`. Redirect URIs must be
     * https; plain http on a loopback address is accepted outside production (test clients).
     */
    OAUTH_EXTRA_CLIENTS: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.OAUTH_EXTRA_CLIENTS) {
      const problem = extraClientsProblem(env.OAUTH_EXTRA_CLIENTS, env.NODE_ENV === 'production');
      if (problem)
        ctx.addIssue({ code: 'custom', path: ['OAUTH_EXTRA_CLIENTS'], message: problem });
    }
    if (env.STORAGE_DRIVER === 's3' && !env.S3_BUCKET) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_BUCKET'],
        message: 'Required when STORAGE_DRIVER=s3',
      });
    }
    if (!env.S3_ACCESS_KEY_ID !== !env.S3_SECRET_ACCESS_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['S3_SECRET_ACCESS_KEY'],
        message: 'Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither',
      });
    }
    const vapid = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
    if (vapid.some(Boolean) && !vapid.every(Boolean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['VAPID_SUBJECT'],
        message: 'Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT together, or none',
      });
    }
  });

export type Config = z.infer<typeof envSchema>;

/** Session cookies are `Secure` whenever the web app is served over https. */
export const secureCookies = (config: Config): boolean =>
  new URL(config.WEB_ORIGIN).protocol === 'https:';

/** `/task-manager` when the app is served under a path, else `''`. */
export const webBasePath = (config: Pick<Config, 'WEB_ORIGIN'>): string =>
  new URL(config.WEB_ORIGIN).pathname.replace(/\/+$/, '');

/** Absolute link to a web route, e.g. `webUrl(config, '/invite/abc')`. */
export const webUrl = (config: Pick<Config, 'WEB_ORIGIN'>, path: string): string =>
  `${new URL(config.WEB_ORIGIN).origin}${webBasePath(config)}${path}`;

export const docsEnabled = (config: Config): boolean =>
  config.API_DOCS ?? config.NODE_ENV !== 'production';

/**
 * Reads `.env` from the API package directory (if present) into `process.env`,
 * then validates. Variables already set in the environment win over the file.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const envFile = resolve(process.cwd(), '.env');
  if (env === process.env && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }

  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee apps/api/.env.example.`);
  }
  return parsed.data;
}
