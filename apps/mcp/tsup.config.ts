import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // @kite/shared ships TypeScript source; bundle everything so Claude Desktop runs one file.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
});
