import {
  acceptInviteSchema,
  apiErrorSchema,
  createInviteSchema,
  createdInviteSchema,
  initialsFor,
  invitePreviewSchema,
  inviteSchema,
  meResponseSchema,
} from '@kite/shared';
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireWorkspaceMember } from '../auth/access.js';
import { avatarColorFor } from '../auth/avatar.js';
import { buildMe } from '../auth/me.js';
import { hashPassword } from '../auth/password.js';
import { resolveSession } from '../auth/plugin.js';
import { createSession, setSessionCookie } from '../auth/sessions.js';
import { hashToken, newToken } from '../auth/tokens.js';
import { webUrl } from '../config.js';
import type { DbOrTx } from '../db/client.js';
import { isUniqueViolation } from '../db/errors.js';
import { one } from '../db/rows.js';
import { invites, users, workspaceMembers, workspaces } from '../db/schema/index.js';
import { httpError } from '../errors.js';
import { activeMember } from '../auth/membership.js';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const tokenParams = z.object({ token: z.string().min(1).max(100) });
const err = apiErrorSchema;

const invalidInvite = () =>
  httpError(404, 'INVITE_INVALID', 'This invite link is invalid or has expired');

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
      schema: {
        tags: ['Invites'],
        summary: 'Invite someone',
        description:
          'Admin or owner. Replaces any earlier pending invite for the same email. The response carries the accept link, once (only its hash is stored); the admin shares it. In development it is also logged to the console.',
        params: z.object({ workspaceId: z.uuid() }),
        body: createInviteSchema,
        response: { 201: createdInviteSchema, 401: err, 403: err, 404: err, 409: err },
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
        .where(
          and(eq(workspaceMembers.workspaceId, workspaceId), eq(users.email, email), activeMember),
        )
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

      const link = webUrl(app.config, `/invite/${token}`);
      if (app.config.NODE_ENV !== 'production') {
        // Handy in dev; production logs never carry invite tokens.
        app.log.info({ email, link }, 'Invite link');
      }

      // The link is a credential: keep it out of every cache.
      return reply.code(201).header('cache-control', 'no-store').send({
        id: invite.id,
        email: invite.email,
        role: role,
        expiresAt: invite.expiresAt.toISOString(),
        link,
      });
    },
  );

  app.get(
    '/workspaces/:workspaceId/invites',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Invites'],
        summary: 'List pending invites',
        description: 'Admin or owner. Unaccepted, unexpired invites, oldest expiry first.',
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: z.array(inviteSchema), 401: err, 403: err, 404: err },
      },
    },
    async (request) => {
      const { workspaceId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      const rows = await app.db
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.workspaceId, workspaceId),
            isNull(invites.acceptedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(invites.expiresAt));
      return rows.map((invite) => ({
        id: invite.id,
        email: invite.email,
        // Owners are never invited; the column shares the workspace role enum.
        role: invite.role === 'admin' ? ('admin' as const) : ('member' as const),
        expiresAt: invite.expiresAt.toISOString(),
      }));
    },
  );

  app.delete(
    '/workspaces/:workspaceId/invites/:inviteId',
    {
      preHandler: app.authenticate,
      schema: {
        tags: ['Invites'],
        summary: 'Revoke a pending invite',
        description: 'Admin or owner. The link stops working. 404 once accepted.',
        params: z.object({ workspaceId: z.uuid(), inviteId: z.uuid() }),
        response: { 204: z.null(), 401: err, 403: err, 404: err },
      },
    },
    async (request, reply) => {
      const { workspaceId, inviteId } = request.params;
      await requireWorkspaceMember(request, workspaceId, 'admin');
      const [row] = await app.db
        .delete(invites)
        .where(
          and(
            eq(invites.id, inviteId),
            eq(invites.workspaceId, workspaceId),
            isNull(invites.acceptedAt),
          ),
        )
        .returning({ id: invites.id });
      if (!row) throw httpError(404, 'NOT_FOUND', 'Invite not found');
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/invites/:token',
    {
      schema: {
        tags: ['Invites'],
        summary: 'Preview an invite',
        description: 'What the accept page shows before joining.',
        security: [],
        params: tokenParams,
        response: { 200: invitePreviewSchema, 404: err },
      },
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
      schema: {
        tags: ['Invites'],
        summary: 'Accept an invite',
        description:
          'New accounts send `name` and `password`; an existing account must be signed in as the invited email (401 `LOGIN_REQUIRED`). 409 `ACCOUNT_EXISTS` when the account was created meanwhile (another invite accepted at the same time): sign in, then accept.',
        security: [{}, { cookieAuth: [] }],
        params: tokenParams,
        body: acceptInviteSchema,
        response: { 200: meResponseSchema, 400: err, 401: err, 404: err, 409: err },
      },
    },
    async (request, reply) => {
      const { name, password } = request.body;
      // Read before the transaction: an existing account accepts with its current session.
      const session = await resolveSession(request, reply);

      const result = await app.db.transaction(async (tx) => {
        const row = await findPendingInvite(tx, request.params.token, true);
        if (!row || row.invite.role === 'owner') throw invalidInvite();
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
          try {
            user = one(await tx.insert(users).values(values).returning(), 'user');
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            throw httpError(
              409,
              'ACCOUNT_EXISTS',
              'An account with this email exists. Sign in to accept.',
            );
          }
          newSessionToken = await createSession(tx, user.id);
        }

        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: invite.workspaceId, userId: user.id, role: invite.role })
          // A deactivated member who is invited again comes back (with the invited role).
          .onConflictDoUpdate({
            target: [workspaceMembers.workspaceId, workspaceMembers.userId],
            set: { deactivatedAt: null, deactivatedBy: null, role: invite.role },
            setWhere: isNotNull(workspaceMembers.deactivatedAt),
          });
        await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, invite.id));
        return { user, newSessionToken };
      });

      if (result.newSessionToken) setSessionCookie(reply, result.newSessionToken, app.config);
      return buildMe(app.db, result.user);
    },
  );
  done();
};
