import { defineConfig } from 'tsup';

export default defineConfig({
  // index: the stdio server Claude Desktop runs. http: the remote connector's HTTP server.
  entry: ['src/index.ts', 'src/http.ts'],
  format: ['esm'],
  platform: 'node',
  // Claude Desktop runs the extension on its own bundled Node (manifest: node >= 20).
  target: 'node20',
  clean: true,
  // Each entry stands alone: the .mcpb ships dist/index.js as a single file.
  splitting: false,
  sourcemap: true,
  // @kite/shared ships TypeScript source; bundle everything so Claude Desktop runs one file.
  noExternal: [/.*/],
  banner: { js: '#!/usr/bin/env node' },
});
