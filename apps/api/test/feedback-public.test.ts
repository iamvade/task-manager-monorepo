import {
  FEEDBACK_UPLOAD_TOKEN_HEADER,
  apiErrorSchema,
  publicFeedbackResultSchema,
} from '@kite/shared';
import { eq } from 'drizzle-orm';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  feedback,
  feedbackActivity,
  feedbackAttachments,
  workspaces,
} from '../src/db/schema/index.js';
import { removeUnclaimedUploads } from '../src/feedback/cleanup-job.js';
import { parseDevice } from '../src/feedback/device.js';
import { sniffMime } from '../src/feedback/validate.js';
import { LocalDiskStorage } from '../src/storage/local.js';
import { createUser, createWorkspace, errorCode, randomIp } from './fixtures.js';
import { PDF, PNG, fileForm, publicForm, validFeedback } from './feedback-setup.js';
import { createTestApp } from './helpers.js';

const LIMIT = 4096;

describe('public feedback form', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kite-feedback-'));
    ctx = await createTestApp({ UPLOADS_DIR: dir, MAX_UPLOAD_BYTES: LIMIT });
  });
  afterAll(async () => {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function world() {
    const owner = await createUser(ctx.db);
    const ws = await createWorkspace(ctx.db, owner.id);
    return { owner, ws, form: publicForm(ctx.app, ws.slug) };
  }
  const rowsOf = (workspaceId: string) =>
    ctx.db.select().from(feedback).where(eq(feedback.workspaceId, workspaceId));

  it('shows the workspace name and limits; 404 for an unknown slug', async () => {
    const { ws, form } = await world();
    const res = await form.call('GET', `/${ws.slug}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ workspaceName: ws.name, maxFiles: 5, maxFileBytes: LIMIT });
    expect((await form.call('GET', '/no-such-workspace')).statusCode).toBe(404);
  });

  it('stores a submission with sequential refs, the parsed device and a created log row', async () => {
    const { ws, form } = await world();
    const first = await form.submit(
      validFeedback({ client: { screen: '390×844', timezone: 'Asia/Ulaanbaatar' } }),
    );
    expect(first.statusCode, first.body).toBe(201);
    expect(publicFeedbackResultSchema.parse(first.json())).toMatchObject({
      ref: 'FB-1001',
      type: 'bug',
      attachmentCount: 0,
      email: 'enkhjin@example.com',
    });
    const second = await form.submit(validFeedback({ title: 'Something else entirely', name: '' }));
    expect(second.json()).toMatchObject({ ref: 'FB-1002' });

    const rows = await rowsOf(ws.id);
    const row = rows.find((r) => r.number === 1001);
    expect(row).toMatchObject({
      status: 'new',
      isRead: false,
      submitterName: 'Enkhjin D.',
      phone: '+976 9911 2233',
      taskId: null,
    });
    expect(row?.device).toMatchObject({
      device: 'iPhone',
      os: 'iOS 17.4',
      browser: 'Safari 17.4',
      kind: 'mobile',
      screen: '390×844',
      timezone: 'Asia/Ulaanbaatar',
    });
    expect(rows.find((r) => r.number === 1002)?.submitterName).toBeNull();
    const log = await ctx.db
      .select()
      .from(feedbackActivity)
      .where(eq(feedbackActivity.feedbackId, row?.id ?? ''));
    expect(log.map((l) => [l.kind, l.actorId])).toEqual([['created', null]]);
  });

  it('answers per-field errors like the form', async () => {
    const { ws, form } = await world();
    const res = await form.submit({
      type: null,
      title: '  ',
      body: 'too short',
      name: '',
      email: 'not-an-email',
      phone: '12',
    });
    expect(res.statusCode).toBe(400);
    expect(apiErrorSchema.parse(res.json()).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fields: {
        type: 'typeRequired',
        title: 'titleRequired',
        body: 'bodyTooShort',
        email: 'emailInvalid',
        phone: 'phoneInvalid',
      },
    });
    const long = await form.submit(validFeedback({ title: 'x'.repeat(121), email: '' }));
    expect(apiErrorSchema.parse(long.json()).error.fields).toEqual({
      title: 'titleTooLong',
      email: 'emailRequired',
    });
    expect(await rowsOf(ws.id)).toHaveLength(0);
  });

  it('pretends to accept a filled honeypot but stores nothing', async () => {
    const { ws, form } = await world();
    const res = await form.submit(validFeedback({ website: 'https://spam.example' }));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: 'bug' });
    expect(await rowsOf(ws.id)).toHaveLength(0);
  });

  it('limits submissions per IP with Retry-After', async () => {
    const { form } = await world();
    const ip = randomIp();
    for (let i = 0; i < 5; i++) {
      expect((await form.submit(validFeedback({ title: `Report ${i}` }), { ip })).statusCode).toBe(
        201,
      );
    }
    const res = await form.submit(validFeedback(), { ip });
    expect(res.statusCode).toBe(429);
    expect(errorCode(res)).toBe('RATE_LIMITED');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    // Someone else is not affected.
    expect((await form.submit(validFeedback())).statusCode).toBe(201);
  });

  it('attaches uploaded files when their tokens come with the form', async () => {
    const { ws, form } = await world();
    const png = await form.upload('screen.png');
    const pdf = await form.upload('receipt.pdf', PDF, 'application/pdf');
    expect(png).toMatchObject({ filename: 'screen.png', mime: 'image/png', size: PNG.length });
    const res = await form.submit(
      validFeedback({ uploads: [png, pdf].map(({ id, token }) => ({ id, token })) }),
    );
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({ attachmentCount: 2 });
    const [row] = await rowsOf(ws.id);
    const files = await ctx.db
      .select()
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.feedbackId, row?.id ?? ''));
    expect(files.map((f) => f.filename).sort()).toEqual(['receipt.pdf', 'screen.png']);
  });

  it('refuses an upload presented with the wrong token or twice', async () => {
    const { form } = await world();
    const file = await form.upload();
    const wrong = await form.submit(validFeedback({ uploads: [{ id: file.id, token: 'nope' }] }));
    expect(wrong.statusCode).toBe(400);
    expect(errorCode(wrong)).toBe('INVALID_UPLOAD');
    const ok = await form.submit(validFeedback({ uploads: [{ id: file.id, token: file.token }] }));
    expect(ok.statusCode).toBe(201);
    const again = await form.submit(
      validFeedback({ uploads: [{ id: file.id, token: file.token }] }),
    );
    expect(errorCode(again)).toBe('INVALID_UPLOAD');
  });

  it('refuses another workspace’s upload', async () => {
    const a = await world();
    const b = await world();
    const file = await a.form.upload();
    const res = await b.form.submit(
      validFeedback({ uploads: [{ id: file.id, token: file.token }] }),
    );
    expect(errorCode(res)).toBe('INVALID_UPLOAD');
  });

  it('takes at most 5 files', async () => {
    const { form } = await world();
    const uploads = await Promise.all(
      Array.from({ length: 6 }, async () => {
        const f = await form.upload();
        return { id: f.id, token: f.token };
      }),
    );
    const res = await form.submit(validFeedback({ uploads }));
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('VALIDATION_ERROR');
  });

  it('accepts only images, video and PDF, checked by content', async () => {
    const { ws, form } = await world();
    const send = (name: string, bytes: Uint8Array | string, type: string) =>
      form.call('POST', `/${ws.slug}/uploads`, fileForm(name, bytes, type));
    // A PNG renamed .pdf, a script renamed .png, a text file, an SVG.
    for (const [name, bytes, type] of [
      ['shot.pdf', PNG, 'application/pdf'],
      ['shot.png', '#!/bin/sh\necho hi\n', 'image/png'],
      ['notes.txt', 'hello there', 'text/plain'],
      ['logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml'],
      ['setup.exe', 'MZ....', 'application/octet-stream'],
    ] as const) {
      const res = await send(name, bytes, type);
      expect(res.statusCode, name).toBe(415);
      expect(errorCode(res)).toBe('FILE_TYPE_NOT_ALLOWED');
    }
    const big = await send(
      'big.png',
      new Uint8Array([...PNG, ...new Uint8Array(LIMIT)]),
      'image/png',
    );
    expect(big.statusCode).toBe(413);
    expect(errorCode(big)).toBe('FILE_TOO_LARGE');
    expect(
      await ctx.db
        .select()
        .from(feedbackAttachments)
        .where(eq(feedbackAttachments.workspaceId, ws.id)),
    ).toHaveLength(0);
  });

  it('removes an upload with its token only', async () => {
    const { form } = await world();
    const file = await form.upload();
    const path = `/uploads/${file.id}`;
    expect((await form.call('DELETE', path)).statusCode).toBe(404);
    expect(
      (
        await form.call('DELETE', path, undefined, {
          headers: { [FEEDBACK_UPLOAD_TOKEN_HEADER]: 'x' },
        })
      ).statusCode,
    ).toBe(404);
    const ok = await form.call('DELETE', path, undefined, {
      headers: { [FEEDBACK_UPLOAD_TOKEN_HEADER]: file.token },
    });
    expect(ok.statusCode).toBe(204);
    const [row] = await ctx.db
      .select()
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.id, file.id));
    expect(row).toBeUndefined();
  });

  it('cleans up uploads never sent after a day', async () => {
    const { ws, form } = await world();
    const file = await form.upload();
    const storage = new LocalDiskStorage(dir);
    const filesBefore = (await readdir(join(dir, ws.id, 'feedback'))).length;
    expect(await removeUnclaimedUploads(ctx.db, storage, new Date())).toBe(0);
    const removed = await removeUnclaimedUploads(
      ctx.db,
      storage,
      new Date(Date.now() + 25 * 3_600_000),
    );
    expect(removed).toBeGreaterThanOrEqual(1);
    const [row] = await ctx.db
      .select()
      .from(feedbackAttachments)
      .where(eq(feedbackAttachments.id, file.id));
    expect(row).toBeUndefined();
    expect((await readdir(join(dir, ws.id, 'feedback'))).length).toBe(filesBefore - 1);
  });

  it('notes similar recent reports in the log', async () => {
    const { ws, form } = await world();
    await form.submit(validFeedback({ title: 'Pay button hidden behind the keyboard' }));
    await form.submit(validFeedback({ title: 'Completely unrelated invoice question' }));
    await form.submit(validFeedback({ title: 'Pay button hidden behind keyboard on iPhone' }));
    const rows = await rowsOf(ws.id);
    const latest = rows.find((r) => r.number === 1003);
    const log = await ctx.db
      .select()
      .from(feedbackActivity)
      .where(eq(feedbackActivity.feedbackId, latest?.id ?? ''));
    const similar = log.find((l) => l.kind === 'similar_found');
    expect(similar?.data.similar?.map((s) => s.ref)).toEqual(['FB-1001']);
  });

  it('keeps the numbering per workspace', async () => {
    const a = await world();
    const b = await world();
    await a.form.submit();
    expect((await b.form.submit()).json()).toMatchObject({ ref: 'FB-1001' });
    const [wsRow] = await ctx.db.select().from(workspaces).where(eq(workspaces.id, a.ws.id));
    expect(wsRow?.feedbackSeq).toBe(1001);
  });
});

describe('feedback device and content checks', () => {
  it('parses common user agents', () => {
    expect(
      parseDevice(
        'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      ),
    ).toMatchObject({
      device: 'SM-A546B',
      os: 'Android 14',
      browser: 'Chrome 128',
      kind: 'mobile',
    });
    expect(
      parseDevice(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0',
      ),
    ).toMatchObject({ device: null, os: 'Windows 10/11', browser: 'Edge 128', kind: 'desktop' });
    expect(parseDevice('')).toMatchObject({ device: null, os: null, browser: null, kind: null });
  });

  it('recognizes allowed file contents', () => {
    expect(sniffMime(Buffer.from(PNG))).toBe('image/png');
    expect(sniffMime(Buffer.from(PDF))).toBe('application/pdf');
    expect(sniffMime(Buffer.from('....ftypqt  ....', 'latin1'))).toBe('video/quicktime');
    expect(sniffMime(Buffer.from('....ftypheic....', 'latin1'))).toBe('image/heic');
    expect(sniffMime(Buffer.from('hello world, plain'))).toBeNull();
  });
});
