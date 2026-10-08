import { defineConfig } from 'drizzle-kit';
import { loadConfig } from './src/config.js';

const config = loadConfig();

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema',
  out: './drizzle',
  dbCredentials: { url: config.DATABASE_URL },
  strict: true,
  verbose: true,
});
