import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { verifyPassword } from '../src/auth/password.js';
import { users, workspaceHolidays, workspaceMembers } from '../src/db/schema/index.js';
import {
  createOwnerWorkspace,
  InitError,
  initWorkspace,
  initWorkspaceInputSchema,
  workspaceSlug,
} from '../src/setup/init-workspace.js';
import { createUser, createWorkspace, ORIGIN, randomIp } from './fixtures.js';
import { createTestApp } from './helpers.js';

const PASSWORD = 'first-run-password';
const unique = () => Math.random().toString(36).slice(2, 10);

describe('first-run workspace setup', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const input = (overrides: Record<string, string> = {}) =>
    initWorkspaceInputSchema.parse({
      workspaceName: 'Kite Studio',
      email: `Owner-${unique()}@Kite.test`,
      name: 'Anu Bat',
      password: PASSWORD,
      ...overrides,
    });

  it('creates the owner, the workspace and its holidays, and the owner can sign in', async () => {
    const data = input({ locale: 'en', timezone: 'Europe/Berlin' });
    const { user, workspace } = await ctx.db.transaction((tx) => createOwnerWorkspace(tx, data));

    expect(workspace.slug).toBe('kite-studio');
    const [row] = await ctx.db.select().from(users).where(eq(users.id, user.id));
    expect(row).toMatchObject({
      email: data.email,
      name: 'Anu Bat',
      initials: 'AB',
      locale: 'en',
      timezone: 'Europe/Berlin',
    });
    expect(row?.email).toBe(row?.email.toLowerCase());
    expect(await verifyPassword(row?.passwordHash, PASSWORD)).toBe(true);

    const members = await ctx.db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id));
    expect(members).toMatchObject([{ userId: user.id, role: 'owner', capacityPoints: 15 }]);
    const holidays = await ctx.db
      .select()
      .from(workspaceHolidays)
      .where(eq(workspaceHolidays.workspaceId, workspace.id));
    expect(holidays.length).toBeGreaterThan(0);

    const login = await ctx.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: ORIGIN },
      remoteAddress: randomIp(),
      payload: { email: data.email, password: PASSWORD },
    });
    expect(login.statusCode).toBe(200);
  });

  it('defaults to Mongolian and Ulaanbaatar time', () => {
    expect(input()).toMatchObject({ locale: 'mn', timezone: 'Asia/Ulaanbaatar' });
  });

  it('refuses an email that already has an account', async () => {
    const existing = await createUser(ctx.db);
    await expect(
      ctx.db.transaction((tx) => createOwnerWorkspace(tx, input({ email: existing.email }))),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('refuses once any workspace exists', async () => {
    const owner = await createUser(ctx.db);
    await createWorkspace(ctx.db, owner.id);
    const err: unknown = await initWorkspace(ctx.db, input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InitError);
    expect(err).toMatchObject({ code: 'ALREADY_INITIALIZED' });
  });

  it('validates the password, email, locale and time zone before touching the database', () => {
    const bads: Record<string, string>[] = [
      { password: 'short' },
      { email: 'not-an-email' },
      { locale: 'de' },
      { timezone: 'Mars/Olympus' },
      { workspaceName: '  ' },
    ];
    for (const bad of bads) {
      expect(() => input(bad)).toThrow(ZodError);
    }
  });

  it('slugs the workspace name, falling back for names without Latin letters', () => {
    expect(workspaceSlug('Kite Studio')).toBe('kite-studio');
    expect(workspaceSlug('  Café — Crème  ')).toBe('cafe-creme');
    expect(workspaceSlug('Кайт студи')).toBe('workspace');
    expect(workspaceSlug('x'.repeat(60))).toHaveLength(48);
  });
});
