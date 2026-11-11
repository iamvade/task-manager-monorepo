import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  // Claude Desktop runs the extension on its own bundled Node (manifest: node >= 20).
  target: 'node20',
  clean: true,
  sourcemap: true,
  // @kite/shared ships TypeScript source; bundle everything so Claude Desktop runs one file.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
});
