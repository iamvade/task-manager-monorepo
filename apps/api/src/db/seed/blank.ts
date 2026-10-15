import type { Db } from '../client.js';
import { initWorkspace, type InitWorkspaceInput } from '../../setup/init-workspace.js';

/** The only account `pnpm db:reset` creates: the owner of an otherwise empty workspace. */
export const BLANK_SEED: InitWorkspaceInput = {
  workspaceName: 'Shoppy',
  email: 'lkhagvadorj.b@shoppy.mn',
  name: 'Лхагвадорж Батмөнх',
  password: 'password123',
  locale: 'mn',
  timezone: 'Asia/Ulaanbaatar',
};

/** One workspace with its owner and public holidays; no spaces, projects or tasks. */
export async function runBlankSeed(db: Db): Promise<void> {
  const { user, workspace } = await initWorkspace(db, BLANK_SEED);
  console.log(`Seeded empty workspace "${workspace.name}" with owner ${user.email}.`);
}
