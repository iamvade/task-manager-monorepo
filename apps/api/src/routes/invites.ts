import { createHash } from 'node:crypto';
import {
  AVATAR_COLORS,
  acceptInviteSchema,
  apiErrorSchema,
  createInviteSchema,
  initialsFor,
  invitePreviewSchema,
  inviteSchema,
  meResponseSchema,
  type PaletteKey,
} from '@kite/shared';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { buildMe } from '../auth/me.js';
import { hashPassword } from '../auth/password.js';
import { resolveSession } from '../auth/plugin.js';
import { createSession, setSessionCookie } from '../auth/sessions.js';
import { hashToken, newToken } from '../auth/tokens.js';
import type { DbOrTx } from '../db/client.js';
import { one } from '../db/rows.js';
import { invites, users, workspaceMembers, workspaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenParams = z.object({ token: z.string().min(1).max(100) });
const err = apiErrorSchema;

const invalidInvite = () =>
  httpError(404, 'INVITE_INVALID', 'This invite link is invalid or has expired');

/** Stable per email, so the same person gets the same color if they're invited again. */
function avatarColorFor(email: string): PaletteKey {
  const n = createHash('sha256').update(email).digest().readUInt32BE(0);
  return AVATAR_COLORS[n % AVATAR_COLORS.length] ?? 'indigo';
}

/** A pending (unaccepted, unexpired) invite by raw token, optionally row-locked. */
async function findPendingInvite(db: DbOrTx, token: string, lock = false) {
  const query = db
    .select({ invite: invites, workspaceName: workspaces.name })
    .from(invites)
    .innerJoin(workspaces, eq(workspaces.id, invites.workspaceId))
    .where(
      and(
        eq(invites.tokenHash, hashToken(token)),
        isNull(invites.acceptedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const [row] = await (lock ? query.for('update', { of: invites }) : query);
  return row;
}

export const inviteRoutes: FastifyPluginCallbackZod = (app, _opts, done) => {
  app.post(
    '/workspaces/:workspaceId/invites',
    {
      preHandler: app.authenticate,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        params: z.object({ workspaceId: z.uuid() }),
        body: createInviteSchema,
        response: { 201: inviteSchema, 401: err, 403: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      const { email, role } = request.body;

      const [alreadyMember] = await app.db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .innerJoin(users, eq(users.id, workspaceMembers.userId))
        .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.email, email)))
        .limit(1);
      if (alreadyMember) {
        throw httpError(409, 'ALREADY_MEMBER', 'This person is already in the workspace');
      }

      const token = newToken();
      const invite = await app.db.transaction(async (tx) => {
        // One live link per person: a re-invite replaces the earlier one.
        await tx
          .delete(invites)
          .where(
            and(
              eq(invites.workspaceId, workspaceId),
              eq(invites.email, email),
              isNull(invites.acceptedAt),
            ),
          );
        const values = {
          workspaceId,
          email,
          role,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        };
        return one(await tx.insert(invites).values(values).returning(), 'invite');
      });

      if (app.config.NODE_ENV !== 'production') {
        // No email delivery yet: in dev the link goes to the console.
        const link = `${new URL(app.config.WEB_ORIGIN).origin}/invite/${token}`;
        app.log.info({ email, link }, 'Invite link');
      }

      return reply.code(201).send({
        id: invite.id,
        email: invite.email,
        role: role,
        expiresAt: invite.expiresAt.toISOString(),
      });
    },
  );

  app.get(
    '/invites/:token',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { params: tokenParams, response: { 200: invitePreviewSchema, 404: err } },
    },
    async (request) => {
      const row = await findPendingInvite(app.db, request.params.token);
      if (!row || row.invite.role === 'owner') throw invalidInvite();
      const [existing] = await app.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, row.invite.email))
        .limit(1);
      return {
        workspace: { name: row.workspaceName },
        email: row.invite.email,
        role: row.invite.role,
        expiresAt: row.invite.expiresAt.toISOString(),
        accountExists: Boolean(existing),
      };
    },
  );

  app.post(
    '/invites/:token/accept',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        params: tokenParams,
        body: acceptInviteSchema,
        response: { 200: meResponseSchema, 400: err, 401: err, 404: err },
      },
    },
    async (request, reply) => {
      const { name, password } = request.body;
      // Read before the transaction: an existing account accepts with its current session.
      const session = await resolveSession(request, reply);

      const result = await app.db.transaction(async (tx) => {
        const row = await findPendingInvite(tx, request.params.token, true);
        if (!row) throw invalidInvite();
        const { invite } = row;

        const [existing] = await tx
          .select()
          .from(users)
          .where(eq(users.email, invite.email))
          .limit(1);
        let user = existing;
        let newSessionToken: string | undefined;

        if (user) {
          if (session?.user.id !== user.id) {
            throw httpError(401, 'LOGIN_REQUIRED', 'Sign in as the invited account to accept');
          }
        } else {
          if (!name || !password) {
            throw httpError(400, 'VALIDATION_ERROR', 'Name and password are required');
          }
          const values = {
            email: invite.email,
            name,
            initials: initialsFor(name),
            avatarColor: avatarColorFor(invite.email),
            passwordHash: await hashPassword(password),
          };
          user = one(await tx.insert(users).values(values).returning(), 'user');
          newSessionToken = await createSession(tx, user.id);
        }

        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role })
          .onConflictDoNothing();
        await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
        return { user, newSessionToken };
      });

      if (result.newSessionToken) setSessionCookie(reply, result.newSessionToken, app.config);
      return buildMe(app.db, result.user);
    },
  );
  done();
};
