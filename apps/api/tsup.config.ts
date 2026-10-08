import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/migrate.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // @kite/shared ships TypeScript source, so bundle it in.
  noExternal: ['@kite/shared'],
});
