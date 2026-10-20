import { workspaceSlug } from '@kite/shared';
import type { Db } from '../client.js';
import { createAccount, createWorkspace, type NewAccountInput } from '../../setup/workspaces.js';
import { workspaceMembers } from '../schema/index.js';

/** The platform admin `pnpm db:reset` creates (`/admin`: new workspaces and their owners). */
export const BLANK_VADE: NewAccountInput = {
  email: 'vade@shoppy.mn',
  name: 'Vade',
  password: 'password123',
  locale: 'mn',
  timezone: 'Asia/Ulaanbaatar',
};

/** The workspace `pnpm db:reset` creates, with its owner. */
export const BLANK_SEED = {
  workspaceName: 'Shoppy',
  owner: {
    email: 'lkhagvadorj.b@shoppy.mn',
    name: 'Лхагвадорж Батмөнх',
    password: 'password123',
    locale: 'mn',
    timezone: 'Asia/Ulaanbaatar',
  } satisfies NewAccountInput,
};

/** The platform admin plus one workspace with its owner and public holidays; no spaces, projects or tasks. */
export async function runBlankSeed(db: Db): Promise<void> {
  const { owner, workspace } = await db.transaction(async (tx) => {
    const vade = await createAccount(tx, BLANK_VADE, 'vade');
    const owner = await createAccount(tx, BLANK_SEED.owner);
    const workspace = await createWorkspace(tx, {
      name: BLANK_SEED.workspaceName,
      slug: workspaceSlug(BLANK_SEED.workspaceName),
    });
    await tx
      .insert(workspaceMembers)
      .values({ workspaceId: workspace.id, userId: owner.id, role: 'owner' });
    console.log(`Platform admin: ${vade.email}`);
    return { owner, workspace };
  });
  console.log(`Seeded empty workspace "${workspace.name}" with owner ${owner.email}.`);
}
