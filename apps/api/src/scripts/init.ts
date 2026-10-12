import { parseArgs } from 'node:util';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { createDb } from '../db/client.js';
import {
  assertNotInitialized,
  initWorkspace,
  initWorkspaceInputSchema,
} from '../setup/init-workspace.js';

const USAGE = `Creates the first workspace and its owner account on an empty database.

Usage:
  node dist/scripts/init.js --workspace <name> --email <email> --name <full name>
                            [--locale mn|en] [--timezone <IANA zone>]

The password is asked for on the terminal (twice, not echoed). Without a terminal,
set INIT_PASSWORD in the environment instead.

Options:
  --workspace   Workspace name, e.g. "Kite Studio"
  --email       Owner's sign-in email
  --name        Owner's full name, e.g. "Anu Bat"
  --locale      UI language for the owner (default mn)
  --timezone    Owner's time zone (default Asia/Ulaanbaatar)
  -h, --help    Show this help
`;

/** Reads one line from the terminal without echoing it. */
function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  return new Promise((resolve, reject) => {
    let value = '';
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const done = (error?: Error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') {
          done();
          return;
        }
        if (char === '\u0003') {
          done(new Error('Cancelled.'));
          return;
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPassword(): Promise<string> {
  const fromEnv = process.env.INIT_PASSWORD;
  if (fromEnv) return fromEnv;
  if (!process.stdin.isTTY) {
    throw new Error(
      'No terminal to ask for the password. Run with a TTY (docker compose run, not -T) or set INIT_PASSWORD.',
    );
  }
  for (;;) {
    const first = await readHidden('Owner password (min 8 characters): ');
    const second = await readHidden('Repeat password: ');
    if (first === second) return first;
    console.error('Passwords did not match, try again.');
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      workspace: { type: 'string' },
      email: { type: 'string' },
      name: { type: 'string' },
      locale: { type: 'string' },
      timezone: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (!values.workspace || !values.email || !values.name) {
    console.error(`--workspace, --email and --name are required.\n\n${USAGE}`);
    return 1;
  }

  const config = loadConfig();
  const fields = {
    workspaceName: values.workspace,
    email: values.email,
    name: values.name,
    locale: values.locale,
    timezone: values.timezone,
  };
  // Check the flags and the database before asking for a password.
  initWorkspaceInputSchema.omit({ password: true }).parse(fields);
  const { db, pool } = createDb(config.DATABASE_URL);
  try {
    await assertNotInitialized(db);
    const input = initWorkspaceInputSchema.parse({ ...fields, password: await readPassword() });
    const { user, workspace } = await initWorkspace(db, input);
    console.log(`Created workspace "${workspace.name}" with owner ${user.email}.`);
    console.log(`Sign in at ${config.WEB_ORIGIN}`);
    return 0;
  } finally {
    await pool.end();
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  if (err instanceof z.ZodError) {
    const issues = err.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Invalid input:\n${issues}`);
  } else if (err instanceof Error) {
    console.error(err.message);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
}
