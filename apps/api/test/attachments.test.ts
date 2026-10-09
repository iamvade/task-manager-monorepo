import { attachmentSchema, taskDetailSchema } from '@kite/shared';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentDisposition } from '../src/attachments/http.js';
import { sanitizeFilename } from '../src/attachments/validate.js';
import { attachments } from '../src/db/schema/index.js';
import { LocalDiskStorage } from '../src/storage/local.js';
import { errorCode } from './fixtures.js';
import { createTestApp } from './helpers.js';
import { taskWorld } from './task-setup.js';

const LIMIT = 1024;

const form = (name: string, body: string | Uint8Array, type = 'application/octet-stream') => {
  const data = new FormData();
  data.append('file', new Blob([body], { type }), name);
  return data;
};

describe('attachments', () => {
  let ctx: Awaited<ReturnType<typeof createTestApp>>;
  let dir: string;
  let storage: LocalDiskStorage;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kite-uploads-'));
    ctx = await createTestApp({ UPLOADS_DIR: dir, MAX_UPLOAD_BYTES: LIMIT });
    storage = new LocalDiskStorage(dir);
  });

  afterAll(async () => {
    await ctx.close();
    await rm(dir, { recursive: true, force: true });
  });

  async function world() {
    const w = await taskWorld(ctx);
    const task = await w.createTask({ title: 'Checkout page' });
    const upload = (api: typeof w.api, data: FormData, taskId = task.id) =>
      api('POST', `/tasks/${taskId}/attachments`, data);
    const rows = () => ctx.db.select().from(attachments).where(eq(attachments.taskId, task.id));
    return { ...w, task, upload, rows };
  }

  /** Files stored for a task (any depth under the uploads dir). */
  async function storedFiles() {
    return (await readdir(dir, { recursive: true, withFileTypes: true })).filter((e) => e.isFile());
  }

  it('uploads, lists on the task, logs activity and downloads with the original name', async () => {
    const { api, owner, ws, task, upload, rows, activities } = await world();
    const res = await upload(api, form('Тайлан "Q4".pdf', '%PDF-1.7 hello', 'application/PDF'));
    expect(res.statusCode, res.body).toBe(201);
    const a = attachmentSchema.parse(res.json());
    expect(a).toMatchObject({
      filename: 'Тайлан "Q4".pdf',
      mime: 'application/pdf',
      size: 14,
      uploader: { id: owner.id },
    });

    const [row] = await rows();
    expect(row?.storageKey).toBe(`${ws.id}/${task.id}/${a.id}`);
    expect(existsSync(storage.pathOf(row?.storageKey ?? ''))).toBe(true);

    const detail = taskDetailSchema.parse((await api('GET', `/tasks/${task.id}`)).json());
    expect(detail.attachments.map((x) => x.id)).toEqual([a.id]);
    expect(detail.attachmentCount).toBe(1);
    const added = (await activities(task.id)).find((x) => x.type === 'attachment.added');
    expect(added?.payload).toEqual({ attachment: { id: a.id, filename: a.filename } });

    const dl = await api('GET', `/attachments/${a.id}/download`);
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toBe('%PDF-1.7 hello');
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['content-length']).toBe('14');
    expect(dl.headers['content-disposition']).toBe(
      `attachment; filename="______ _Q4_.pdf"; filename*=UTF-8''%D0%A2%D0%B0%D0%B9%D0%BB%D0%B0%D0%BD%20%22Q4%22.pdf`,
    );
    expect(dl.headers['x-content-type-options']).toBe('nosniff');
    expect(dl.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
  });

  it('serves raster images inline on request, everything else as a download', async () => {
    const { api, upload } = await world();
    const png = attachmentSchema.parse(
      (await upload(api, form('shot.png', '\x89PNG....', 'image/png'))).json(),
    );
    const svg = attachmentSchema.parse(
      (await upload(api, form('logo.svg', '<svg/>', 'image/svg+xml'))).json(),
    );
    const disp = async (id: string) =>
      (await api('GET', `/attachments/${id}/download?inline=true`)).headers['content-disposition'];
    expect(await disp(png.id)).toMatch(/^inline; /);
    expect(await disp(svg.id)).toMatch(/^attachment; /);
  });

  it('refuses files over the limit and keeps nothing', async () => {
    const { api, upload, rows } = await world();
    const before = (await storedFiles()).length;
    const res = await upload(api, form('big.bin', new Uint8Array(LIMIT + 1)));
    expect(res.statusCode).toBe(413);
    expect(errorCode(res)).toBe('FILE_TOO_LARGE');
    expect(await rows()).toEqual([]);
    expect((await storedFiles()).length).toBe(before);

    // Exactly at the limit is fine.
    expect((await upload(api, form('ok.bin', new Uint8Array(LIMIT)))).statusCode).toBe(201);
  });

  it('blocks executables by extension, declared type and content', async () => {
    const { api, upload, rows } = await world();
    const before = (await storedFiles()).length;
    const blocked = [
      form('setup.exe', 'hello'),
      form('invoice.pdf.EXE', 'hello'),
      form('run.sh.', 'echo'),
      form('notes.txt', 'hello', 'application/x-msdownload'),
      form('report.pdf', 'MZ\x90\x00\x03', 'application/pdf'),
      form('image.png', '\x7fELF\x02\x01', 'image/png'),
      form('script.txt', '#!/bin/sh\nrm -rf /', 'text/plain'),
    ];
    for (const data of blocked) {
      const res = await upload(api, data);
      expect(res.statusCode, res.body).toBe(415);
      expect(errorCode(res)).toBe('FILE_TYPE_BLOCKED');
    }
    expect(await rows()).toEqual([]);
    expect((await storedFiles()).length).toBe(before);

    // A short file that isn't an executable still goes through the content check.
    expect((await upload(api, form('a.txt', 'M'))).statusCode).toBe(201);
    expect((await upload(api, form('empty.txt', ''))).statusCode).toBe(201);
  });

  it('requires a multipart file', async () => {
    const { api, task, upload } = await world();
    let res = await upload(api, new FormData());
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('FILE_REQUIRED');
    res = await api('POST', `/tasks/${task.id}/attachments`, { file: 'nope' });
    expect(res.statusCode).toBe(415);
  });

  it('cleans up file names', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\me\\a.png')).toBe('a.png');
    expect(sanitizeFilename('a\u0000b\nc.txt')).toBe('abc.txt');
    expect(sanitizeFilename('..')).toBe('file');
    expect(sanitizeFilename('%22quoted%22.txt')).toBe('"quoted".txt');
    expect(sanitizeFilename('')).toBe('file');
    const long = sanitizeFilename(`${'я'.repeat(300)}.docx`);
    expect(long).toHaveLength(255);
    expect(long.endsWith('.docx')).toBe(true);
    expect(contentDisposition('a\r\nb.txt', 'attachment')).not.toMatch(/[\r\n]/);
  });

  it('checks access and permissions', async () => {
    const { api, task, upload, person } = await world();
    const sara = await person('member', 'Sara Khan');
    const dorj = await person('member', 'Dorj Enkh');
    const admin = await person('admin', 'Ada Admin');
    const { api: outsider } = await person(null);

    const mine = attachmentSchema.parse((await upload(sara.api, form('a.txt', 'a'))).json());
    const theirs = attachmentSchema.parse((await upload(sara.api, form('b.txt', 'b'))).json());

    expect((await upload(outsider, form('x.txt', 'x'))).statusCode).toBe(404);
    expect((await outsider('GET', `/attachments/${mine.id}/download`)).statusCode).toBe(404);
    expect((await outsider('DELETE', `/attachments/${mine.id}`)).statusCode).toBe(404);

    // Any member downloads; only the uploader or an admin deletes.
    expect((await dorj.api('GET', `/attachments/${mine.id}/download`)).statusCode).toBe(200);
    const res = await dorj.api('DELETE', `/attachments/${mine.id}`);
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('FORBIDDEN');

    const [row] = await ctx.db.select().from(attachments).where(eq(attachments.id, mine.id));
    expect((await sara.api('DELETE', `/attachments/${mine.id}`)).statusCode).toBe(204);
    expect(existsSync(storage.pathOf(row?.storageKey ?? ''))).toBe(false);
    expect((await sara.api('GET', `/attachments/${mine.id}/download`)).statusCode).toBe(404);
    expect((await admin.api('DELETE', `/attachments/${theirs.id}`)).statusCode).toBe(204);

    // Attachments of a deleted task are hidden.
    const last = attachmentSchema.parse((await upload(api, form('c.txt', 'c'))).json());
    await api('DELETE', `/tasks/${task.id}`);
    expect((await api('GET', `/attachments/${last.id}/download`)).statusCode).toBe(404);
  });

  it('logs attachment.removed', async () => {
    const { api, task, upload, activities } = await world();
    const a = attachmentSchema.parse((await upload(api, form('a.txt', 'a'))).json());
    await api('DELETE', `/attachments/${a.id}`);
    const removed = (await activities(task.id)).find((x) => x.type === 'attachment.removed');
    expect(removed?.payload).toEqual({ attachment: { id: a.id, filename: 'a.txt' } });
  });

  it('answers FILE_MISSING when the stored file is gone', async () => {
    const { api, ws, task, owner } = await world();
    const [row] = await ctx.db
      .insert(attachments)
      .values({
        taskId: task.id,
        uploaderId: owner.id,
        filename: 'seed.png',
        mime: 'image/png',
        size: 10,
        storageKey: `${ws.id}/${task.id}/missing`,
      })
      .returning();
    const res = await api('GET', `/attachments/${row?.id}/download`);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('FILE_MISSING');
  });
});
