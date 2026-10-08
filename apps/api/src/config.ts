import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.url(),
  TEST_DATABASE_URL: z.url().optional(),
  WEB_ORIGIN: z.url().default('http://localhost:5173'),
  COOKIE_SECRET: z.string().min(32),
  /** Set when running behind a reverse proxy so `request.ip` (per-IP rate limits) is the client's. */
  TRUST_PROXY: z.stringbool().default(false),
  /** OpenAPI spec + Swagger UI at /api/docs. Unset = on everywhere except production. */
  API_DOCS: z.stringbool().optional(),
});

export type Config = z.infer<typeof envSchema>;

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
