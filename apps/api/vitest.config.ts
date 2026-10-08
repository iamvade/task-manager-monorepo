import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
    globalSetup: ['test/global-setup.ts'],
    // Integration tests share one real database; run files one at a time.
    fileParallelism: false,
  },
});
