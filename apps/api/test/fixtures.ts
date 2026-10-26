import { apiErrorSchema, authResultSchema, type WorkspaceRole } from '@kite/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { uuidv7 } from 'uuidv7';
import { hashPassword } from '../src/auth/password.js';
import { SESSION_COOKIE } from '../src/auth/sessions.js';
import { loadConfig } from '../src/config.js';
import type { Db } from '../src/db/client.js';
import { one } from '../src/db/rows.js';
import {
  projects,
  spaces,
  statuses,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../src/db/schema/index.js';
import { openStatusPeriods } from '../src/tasks/status.js';

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

export async function createSpace(db: Db, workspaceId: string, position = 'a0') {
  return one(
    await db
      .insert(spaces)
      .values({ workspaceId, name: 'Space', initial: 'S', color: 'violet', position })
      .returning(),
  );
}

export async function createProject(db: Db, workspaceId: string) {
  const space = await createSpace(db, workspaceId);
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

/**
 * Inserts a task row directly (bypassing the API) together with its first status period, which
 * the deferred status-period trigger requires at commit.
 */
export async function insertTask(db: Db, values: typeof tasks.$inferInsert) {
  return db.transaction(async (tx) => {
    const task = one(await tx.insert(tasks).values(values).returning());
    const status = one(await tx.select().from(statuses).where(eq(statuses.id, task.statusId)));
    await openStatusPeriods(tx, [
      { taskId: task.id, status, at: task.createdAt, actorId: task.createdBy },
    ]);
    return task;
  });
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

/**
 * Signs in like the native app (`client: "mobile"`, no Origin) and returns the session token
 * from the body.
 */
export async function loginMobile(
  app: FastifyInstance,
  email: string,
  opts: { deviceName?: string; password?: string } = {},
) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    remoteAddress: randomIp(),
    payload: {
      email,
      password: opts.password ?? PASSWORD,
      client: 'mobile',
      ...(opts.deviceName ? { deviceName: opts.deviceName } : {}),
    },
  });
  const token = authResultSchema.parse(res.json()).session?.token;
  if (res.statusCode !== 200 || !token) {
    throw new Error(`mobile login failed: ${res.statusCode} ${res.body}`);
  }
  return token;
}

/** `Authorization` header for a bearer session. */
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** The `error.code` of an API error response. */
export function errorCode(res: LightMyRequestResponse) {
  return apiErrorSchema.parse(res.json()).error.code;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * Request helper for a signed-in user (or anonymous without `cookie`). Mutations carry the web
 * `Origin` so they pass the CSRF check.
 */
export function apiClient(app: FastifyInstance, cookie?: string) {
  return (method: Method, path: string, payload?: InjectOptions['payload']) =>
    app.inject({
      method,
      url: `/api/v1${path}`,
      headers: { ...(cookie ? { cookie } : {}), ...(method === 'GET' ? {} : { origin: ORIGIN }) },
      ...(payload === undefined ? {} : { payload }),
    });
}
