import { inviteSchema } from '@kite/shared';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { eq } from 'drizzle-orm';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from '../src/auth/sessions.js';
import { hashToken, newToken } from '../src/auth/tokens.js';
import { loadConfig } from '../src/config.js';
import { invites, sessions } from '../src/db/schema/index.js';
import { logSerializers, redactUrl } from '../src/logging.js';
import {
  ORIGIN,
  PASSWORD,
  createUser,
  errorCode,
  login,
  randomIp,
  sessionCookie,
} from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

const DAY = 24 * 60 * 60 * 1000;

describe('config', () => {
  const base = { DATABASE_URL: 'postgres://x@localhost/kite' };

  it('requires NODE_ENV, so a deploy never falls back to development', () => {
    expect(() => loadConfig({ ...base })).toThrow(/NODE_ENV/);
    expect(loadConfig({ ...base, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
  });

  it('reads TRUST_PROXY as a boolean, a hop count or proxy addresses', () => {
    const trust = (TRUST_PROXY?: string) =>
      loadConfig({ ...base, NODE_ENV: 'test', ...(TRUST_PROXY ? { TRUST_PROXY } : {}) })
        .TRUST_PROXY;
    expect(trust()).toBe(false);
    expect(trust('false')).toBe(false);
    expect(trust('true')).toBe(true);
    expect(trust('1')).toBe(1);
    expect(trust('10.0.0.0/8, 127.0.0.1')).toBe('10.0.0.0/8, 127.0.0.1');
  });
});

describe('session cookie and lifetime', () => {
  it('marks the cookie Secure when the web app is served over https', async () => {
    const ctx = await createTestApp({ WEB_ORIGIN: 'https://kite.example' });
    try {
      const user = await createUser(ctx.db);
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: 'https://kite.example' },
        remoteAddress: randomIp(),
        payload: { email: user.email, password: PASSWORD },
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(sessionCookie(res)).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax' });
    } finally {
      await ctx.close();
    }
  });

  it('ends a session 90 days after sign-in even if it was used every day', async () => {
    const ctx = await createTestApp();
    try {
      const user = await createUser(ctx.db);
      const cookie = await login(ctx.app, user.email);
      const me = () =>
        ctx.app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { cookie } });
      expect((await me()).statusCode).toBe(200);

      // Still within its sliding expiry, but signed in 91 days ago.
      await ctx.db
        .update(sessions)
        .set({ createdAt: new Date(Date.now() - 91 * DAY), expiresAt: new Date(Date.now() + DAY) })
        .where(eq(sessions.userId, user.id));
      const res = await me();
      expect(res.statusCode).toBe(401);
      expect(res.cookies.find((c) => c.name === SESSION_COOKIE)?.value).toBe('');
    } finally {
      await ctx.close();
    }
  });
});

describe('logs', () => {
  it('masks invite tokens in request URLs', async () => {
    const lines: string[] = [];
    const stream = new PassThrough();
    stream.on('data', (chunk: Buffer) => lines.push(...chunk.toString().split('\n')));
    const ctx = await createTestApp({}, { logStream: stream });
    try {
      const token = 'SuperSecretInviteToken_0123456789abcdefghijk';
      await ctx.app.inject({ method: 'GET', url: `/api/v1/invites/${token}` });
      await ctx.app.inject({
        method: 'POST',
        url: `/api/v1/invites/${token}/accept`,
        headers: { origin: ORIGIN, cookie: `${SESSION_COOKIE}=abc` },
        payload: { name: 'X', password: 'password123' },
      });
      const text = lines.join('\n');
      expect(text).toContain('/api/v1/invites/[redacted]');
      expect(text).not.toContain(token);
      expect(text).not.toContain('password123');
    } finally {
      await ctx.close();
    }
  });

  it('redacts URLs and drops query parameters from logged database errors', () => {
    expect(redactUrl('/api/v1/invites/abc/accept?x=1')).toBe(
      '/api/v1/invites/[redacted]/accept?x=1',
    );
    expect(redactUrl('/api/v1/password-resets/abc')).toBe('/api/v1/password-resets/[redacted]');
    expect(redactUrl('/api/v1/tasks/APP-1')).toBe('/api/v1/tasks/APP-1');

    const pgError = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint: 'users_email_unique',
      detail: 'Key (email)=(anu@kite.test) already exists.',
    });
    const err = new DrizzleQueryError(
      'insert into "users" ("email", "password_hash") values ($1, $2)',
      ['anu@kite.test', '$argon2id$v=19$secret-hash'],
      pgError,
    );
    const logged = JSON.stringify(logSerializers.err(err));
    expect(logged).toContain('insert into');
    expect(logged).toContain('users_email_unique');
    expect(logged).not.toContain('anu@kite.test');
    expect(logged).not.toContain('secret-hash');
  });
});

describe('invites', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('never answers 500 when two invites for one new email are accepted at once', async () => {
    const email = `race-${Date.now()}@kite.test`;
    // Tokens are only stored hashed: issue ones we know by pointing the invite rows at them.
    const raw: string[] = [];
    for (let i = 0; i < 2; i++) {
      const w = await taskWorld(ctx);
      const res = await w.api('POST', `/workspaces/${w.ws.id}/invites`, { email });
      expect(res.statusCode, res.body).toBe(201);
      const token = newToken();
      await ctx.db
        .update(invites)
        .set({ tokenHash: hashToken(token) })
        .where(eq(invites.id, inviteSchema.parse(res.json()).id));
      raw.push(token);
    }

    const accept = (token: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `/api/v1/invites/${token}/accept`,
        headers: { origin: ORIGIN },
        remoteAddress: randomIp(),
        payload: { name: 'Race', password: 'password123' },
      });
    const results = await Promise.all(raw.map(accept));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes[0]).toBe(200);
    expect([401, 409]).toContain(codes[1]);
    const loser = results.find((r) => r.statusCode !== 200);
    expect(['LOGIN_REQUIRED', 'ACCOUNT_EXISTS']).toContain(loser ? errorCode(loser) : '');
  });
});

describe('uploads and rich text', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kite-quota-'));
    ctx = await createTestApp({ UPLOADS_DIR: dir, MAX_WORKSPACE_STORAGE_BYTES: 20 });
  });

  afterAll(async () => {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  });

  const form = (body: string) => {
    const data = new FormData();
    data.append('file', new Blob([body], { type: 'application/pdf' }), 'a.pdf');
    return data;
  };

  it('stops uploads once the workspace storage quota is used up', async () => {
    const w = await taskWorld(ctx);
    const task = await w.createTask({ title: 'Files' });
    const upload = (body: string) => w.api('POST', `/tasks/${task.id}/attachments`, form(body));

    expect((await upload('%PDF-1.7 abcde')).statusCode).toBe(201); // 14 bytes
    const over = await upload('%PDF-1.7 fghij'); // 28 > 20
    expect(over.statusCode).toBe(413);
    expect(errorCode(over)).toBe('STORAGE_QUOTA_EXCEEDED');
    const files = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) =>
      e.isFile(),
    );
    expect(files).toHaveLength(1);

    // Other workspaces have their own quota.
    const other = await taskWorld(ctx);
    const theirs = await other.createTask({ title: 'Theirs' });
    const res = await other.api('POST', `/tasks/${theirs.id}/attachments`, form('%PDF-1.7 x'));
    expect(res.statusCode).toBe(201);
  });

  it('refuses script links and unknown nodes in descriptions and comments', async () => {
    const w = await taskWorld(ctx);
    const evil = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(document.cookie)' } }],
            },
          ],
        },
      ],
    };
    const created = await w.api('POST', `/projects/${w.project.id}/tasks`, {
      title: 'XSS',
      description: evil,
    });
    expect(created.statusCode).toBe(400);
    expect(errorCode(created)).toBe('VALIDATION_ERROR');

    const task = await w.createTask({ title: 'Fine' });
    const comment = await w.api('POST', `/tasks/${task.id}/comments`, { body: evil });
    expect(comment.statusCode).toBe(400);
    const iframe = await w.api('PATCH', `/tasks/${task.id}`, {
      description: { type: 'doc', content: [{ type: 'iframe', attrs: { src: 'https://x' } }] },
    });
    expect(iframe.statusCode).toBe(400);
  });
});
