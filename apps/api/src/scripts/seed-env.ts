import { localeSchema } from '@kite/shared';
import { z } from 'zod';
import type { SeedOptions } from '../db/seed/index.js';

const seedEnvSchema = z.object({
  SEED_LANG: localeSchema.default('mn'),
  SEED_TODAY: z.iso.date().optional(),
});

/** Reads SEED_LANG (mn|en, default mn) and SEED_TODAY (YYYY-MM-DD). Call after `loadConfig()`. */
export function seedOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SeedOptions {
  const parsed = seedEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid seed options:\n${issues}`);
  }
  return {
    lang: parsed.data.SEED_LANG,
    ...(parsed.data.SEED_TODAY ? { today: parsed.data.SEED_TODAY } : {}),
  };
}
