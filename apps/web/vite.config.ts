/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

/** `BASE_PATH=/tasks` builds the app for a sub-path (`/tasks/…`); empty = the domain root. */
function basePath(raw = ''): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (trimmed && !/^\/[\w\-./]*$/.test(trimmed)) {
    throw new Error(`BASE_PATH must look like /tasks, got "${raw}"`);
  }
  return `${trimmed}/`;
}

export default defineConfig({
  base: basePath(process.env.BASE_PATH),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin /api in dev so session cookies just work (`ws`: the realtime socket too).
    proxy: { '/api': { target: apiTarget, changeOrigin: false, ws: true } },
  },
  build: {
    rolldownOptions: {
      output: {
        // React in its own long-cached chunk. Other vendors (TipTap, dnd-kit, date-fns) follow the
        // lazy route/overlay chunks that use them; a manual group for them would also capture
        // their shared dependencies and drag them into the entry.
        codeSplitting: {
          groups: [
            {
              name: 'react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
