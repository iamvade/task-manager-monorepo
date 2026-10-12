import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests (`pnpm e2e`): their own API (port 3100) on a freshly reset and seeded
 * `kite_e2e` database (English sample data), and their own Vite server (port 5273) proxying to
 * it, so a running `pnpm dev` is left alone.
 */
const API_PORT = 3100;
const WEB_PORT = 5273;
const WEB_ORIGIN = `http://localhost:${String(WEB_PORT)}`;
const apiDir = fileURLToPath(new URL('../api', import.meta.url));

/** `E2E_DATABASE_URL`, else the API's `DATABASE_URL` (apps/api/.env) pointed at `kite_e2e`. */
function e2eDatabaseUrl(): string {
  if (process.env.E2E_DATABASE_URL) return process.env.E2E_DATABASE_URL;
  const envFile = `${apiDir}/.env`;
  const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  const url = new URL(
    process.env.DATABASE_URL ?? env.DATABASE_URL ?? 'postgres://kite:kite@localhost:5432/kite',
  );
  url.pathname = '/kite_e2e';
  return url.toString();
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_ORIGIN,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 1000 },
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      // Reset + seed first, so every run starts from the sample data.
      command: 'pnpm db:e2e && pnpm exec tsx src/server.ts',
      cwd: apiDir,
      url: `http://127.0.0.1:${String(API_PORT)}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        PORT: String(API_PORT),
        WEB_ORIGIN,
        SEED_LANG: 'en',
        REPORTS_CACHE_TTL_MS: '0',
        LOG_LEVEL: 'warn',
      },
    },
    {
      command: `pnpm exec vite --port ${String(WEB_PORT)} --strictPort`,
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://127.0.0.1:${String(API_PORT)}` },
    },
  ],
});
