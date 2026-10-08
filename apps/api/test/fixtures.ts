import { apiErrorSchema, type WorkspaceRole } from '@kite/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_COOKIE } from '../src/auth/sessions.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db/client.js';
import { one } from '../src/db/rows.js';
import { projects, spaces, users, workspaceMembers, workspaces } from '../src/db/schema/index.js';

// Fixtures use unique emails/slugs so tests can share the database without truncating it.

export const ORIGIN = new URL(loadConfig().WEB_ORIGIN).origin;
export const PASSWORD = 'correct horse battery';

let passwordHash: Promise<string> | undefined;

const unique = () => uuidv7().replace(/-/g, '').slice(-12);

/** A fresh client IP per call, so per-IP login limits don't trip across tests. */
export const randomIp = () =>
  `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;

export async function createUser(db: Db, overrides: { email?: string; name?: string } = {}) {
  passwordHash ??= hashPassword(PASSWORD);
  return one(
    await db
      .insert(users)
      .values({
        email: overrides.email ?? `user-${unique()}@kite.test`,
        name: overrides.name ?? 'Test User',
        initials: 'TU',
        avatarColor: 'indigo',
        passwordHash: await passwordHash,
      })
      .returning(),
  );
}

export async function createWorkspace(db: Db, ownerId: string) {
  const slug = `ws-${unique()}`;
  const workspace = one(
    await db
      .insert(workspaces)
      .values({ name: `WS ${slug}`, slug })
      .returning(),
  );
  await addMember(db, workspace.id, ownerId, 'owner');
  return workspace;
}

export async function addMember(
  db: Db,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole = 'member',
) {
  await db.insert(workspaceMembers).values({ workspaceId, userId, role });
}

export async function createProject(db: Db, workspaceId: string) {
  const space = one(
    await db
      .insert(spaces)
      .values({ workspaceId, name: 'Space', initial: 'S', color: 'violet', position: 'a0' })
      .returning(),
  );
  return one(
    await db
      .insert(projects)
      .values({
        workspaceId,
        spaceId: space.id,
        name: 'Project',
        key: `P${unique().slice(-6).toUpperCase()}`,
        color: 'blue',
        position: 'a0',
      })
      .returning(),
  );
}

export function sessionCookie(res: LightMyRequestResponse) {
  return res.cookies.find((c) => c.name === SESSION_COOKIE);
}

/** Logs in and returns a `cookie` header value for later requests. */
export async function login(app: FastifyInstance, email: string, password = PASSWORD) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: ORIGIN },
    remoteAddress: randomIp(),
    payload: { email, password },
  });
  const cookie = sessionCookie(res);
  if (res.statusCode !== 200 || !cookie) {
    throw new Error(`login failed: ${res.statusCode} ${res.body}`);
  }
  return `${SESSION_COOKIE}=${cookie.value}`;
}

/** The `error.code` of an API error response. */
export function errorCode(res: LightMyRequestResponse) {
  return apiErrorSchema.parse(res.json()).error.code;
}
