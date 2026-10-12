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
    WEB_ORIGIN: z.url().default('http://localhost:5173'),
    /** Set when running behind a reverse proxy so `request.ip` (per-IP rate limits) is the client's. */
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
  })
  .superRefine((env, ctx) => {
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
  });

export type Config = z.infer<typeof envSchema>;

/** Session cookies are `Secure` whenever the web app is served over https. */
export const secureCookies = (config: Config): boolean =>
  new URL(config.WEB_ORIGIN).protocol === 'https:';

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
