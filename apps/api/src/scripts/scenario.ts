/**
 * Scenario workspaces for trying the app at realistic sizes, separate from the design seed:
 *   pnpm db:scenario small          "Nomad Labs": 7 people, 4 projects, ~300 tasks, 3 months
 *   pnpm db:scenario large          "Altai Group": 120 people, 60 projects, ~25k tasks, a year
 *   pnpm db:scenario small --drop   remove it again
 * Re-running replaces the scenario. Dates are relative to today (SEED_TODAY pins it).
 */
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import { SCENARIOS, dropScenario, runScenario, type ScenarioName } from '../db/scenario/index.js';
import { seedOptionsFromEnv } from './seed-env.js';

const config = loadConfig();
if (config.NODE_ENV === 'production') {
  // Scenario accounts share a published password.
  console.error('Refusing to seed scenario data when NODE_ENV=production.');
  process.exit(1);
}

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('-'));
if (!name || !(name in SCENARIOS)) {
  console.error(`Usage: pnpm db:scenario <${Object.keys(SCENARIOS).join('|')}> [--drop]`);
  process.exit(1);
}
const def = SCENARIOS[name as ScenarioName];

const { db, pool } = createDb(config.DATABASE_URL);
try {
  if (args.includes('--drop')) {
    const dropped = await dropScenario(db, def);
    console.log(dropped ? `Removed "${def.name}".` : `"${def.name}" is not in the database.`);
  } else {
    await runScenario(db, def, seedOptionsFromEnv());
  }
} finally {
  await pool.end();
}
