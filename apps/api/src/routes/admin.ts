import {
  adminWorkspaceSchema,
  apiErrorSchema,
  createWorkspaceSchema,
  createdOwnerInviteSchema,
  createdWorkspaceSchema,
  ownerInviteRequestSchema,
  type AdminWorkspace,
} from '@kite/shared';
import { and, asc, count, desc, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { activeMember } from '../auth/membership.js';
import { requireVade } from '../auth/platform.js';
import type { DbOrTx } from '../db/client.js';
import { invites, users, workspaceMembers, workspaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { insertInvite } from '../invites/create.js';
import { SetupError, createWorkspace } from '../setup/workspaces.js';
import { hasActiveOwner } from './invites.js';

const err = apiErrorSchema;

/** The console rows for the given workspaces (all of them when `ids` is omitted), newest first. */
async function adminWorkspaces(db: DbOrTx, ids?: string[]): Promise<AdminWorkspace[]> {
  const rows = await db
    .select()
    .from(workspaces)
    .where(ids ? inArray(workspaces.id, ids) : undefined)
    .orderBy(desc(workspaces.createdAt));
  if (rows.length === 0) return [];
  const workspaceIds = rows.map((w) => w.id);

  const counts = await db
    .select({ workspaceId: workspaceMembers.workspaceId, n: count() })
    .from(workspaceMembers)
    .where(and(inArray(workspaceMembers.workspaceId, workspaceIds), activeMember))
    .groupBy(workspaceMembers.workspaceId);
  const owners = await db
    .select({ workspaceId: workspaceMembers.workspaceId, name: users.name, email: users.email })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        inArray(workspaceMembers.workspaceId, workspaceIds),
        eq(workspaceMembers.role, 'owner'),
        activeMember,
      ),
    )
    .orderBy(asc(workspaceMembers.joinedAt));
  const pending = await db
    .select({
      workspaceId: invites.workspaceId,
      email: invites.email,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(
      and(
        inArray(invites.workspaceId, workspaceIds),
        eq(invites.role, 'owner'),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invites.expiresAt));

  return rows.map((w) => {
    const owner = owners.find((o) => o.workspaceId === w.id);
    const invite = owner ? undefined : pending.find((i) => i.workspaceId === w.id);
    return {
      id: w.id,
      name: w.name,
      slug: w.slug,
      createdAt: w.createdAt.toISOString(),
      memberCount: counts.find((c) => c.workspaceId === w.id)?.n ?? 0,
      owner: owner ? { name: owner.name, email: owner.email } : null,
      ownerInvite: invite
        ? { email: invite.email, expiresAt: invite.expiresAt.toISOString() }
        : null,
    };
  });
}

/** 409 when the email is a platform admin's: they never join a workspace. */
async function assertOwnerEmail(db: DbOrTx, email: string): Promise<void> {
  const [user] = await db
    .select({ platformRole: users.platformRole })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (user?.platformRole) {
    throw httpError(409, 'INVALID_OWNER', 'A platform admin cannot own a workspace');
  }
}

/** Replaces the workspace's pending owner invites with a new one; returns it with its link. */
async function issueOwnerInvite(
  app: FastifyInstance,
  tx: DbOrTx,
  workspaceId: string,
  email: string,
) {
  await tx
    .delete(invites)
    .where(
      and(
        eq(invites.workspaceId, workspaceId),
        eq(invites.role, 'owner'),
        isNull(invites.acceptedAt),
      ),
    );
  const { invite, link } = await insertInvite(app, tx, { workspaceId, email, role: 'owner' });
  return { email: invite.email, expiresAt: invite.expiresAt.toISOString(), link };
}

/**
 * The platform admin console (`/admin` on the web). Only for `users.platform_role = 'vade'`, an
 * account that belongs to no workspace; everyone else gets 404.
 */
export const adminRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.get(
    '/admin/workspaces',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Admin'],
        summary: 'List workspaces',
        description:
          'Platform admin only (404 for everyone else). Every workspace, newest first, with its owner or the pending owner invite.',
        response: { 200: z.array(adminWorkspaceSchema), 401: err, 404: err },
      },
    },
    async (request) => {
      requireVade(request);
      return adminWorkspaces(app.db);
    },
  );

  app.post(
    '/admin/workspaces',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Admin'],
        summary: 'Create a workspace',
        description:
          'Platform admin only. Creates the workspace (with the public holidays) and an owner invite; the response carries the accept link, once. 409 `SLUG_TAKEN` when the address is used, `INVALID_OWNER` for a platform admin email.',
        body: createWorkspaceSchema,
        response: { 201: createdWorkspaceSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      requireVade(request);
      const { name, slug, ownerEmail } = request.body;
      await assertOwnerEmail(app.db, ownerEmail);
      let result;
      try {
        result = await app.db.transaction(async (tx) => {
          const workspace = await createWorkspace(tx, { name, slug });
          const invite = await issueOwnerInvite(app, tx, workspace.id, ownerEmail);
          const [row] = await adminWorkspaces(tx, [workspace.id]);
          if (!row) throw new Error('Created workspace not found');
          return { workspace: row, invite };
        });
      } catch (e) {
        if (e instanceof SetupError && e.code === 'SLUG_TAKEN') {
          throw httpError(409, 'SLUG_TAKEN', 'This address is already used');
        }
        throw e;
      }
      // The link is a credential: keep it out of every cache.
      return reply.code(201).header('cache-control', 'no-store').send(result);
    },
  );

  app.post(
    '/admin/workspaces/:workspaceId/owner-invite',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Admin'],
        summary: 'New owner invite link',
        description:
          'Platform admin only. Replaces the pending owner invite (the old link stops working). 409 `OWNER_EXISTS` once someone has accepted, `INVALID_OWNER` for a platform admin email.',
        params: z.object({ workspaceId: z.uuid() }),
        body: ownerInviteRequestSchema,
        response: { 201: createdOwnerInviteSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      requireVade(request);
      const { workspaceId } = request.params;
      const { email } = request.body;
      await assertOwnerEmail(app.db, email);
      const invite = await app.db.transaction(async (tx) => {
        // Serializes with an owner accepting a link (`/invites/:token/accept` locks this row).
        const [workspace] = await tx
          .select({ id: workspaces.id })
          .from(workspaces)
          .where(eq(workspaces.id, workspaceId))
          .for('update');
        if (!workspace) throw httpError(404, 'NOT_FOUND', 'Workspace not found');
        if (await hasActiveOwner(tx, workspaceId)) {
          throw httpError(409, 'OWNER_EXISTS', 'This workspace already has an owner');
        }
        return issueOwnerInvite(app, tx, workspaceId, email);
      });
      return reply.code(201).header('cache-control', 'no-store').send(invite);
    },
  );
  done();
};
