import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { createStorage } from '../src/storage/index.js';
import { LocalDiskStorage } from '../src/storage/local.js';
import { S3Storage } from '../src/storage/s3.js';
import { StorageNotFoundError, type Storage } from '../src/storage/storage.js';

const KEY = 'ws/task/file-1';

/** The same behavior for every driver. */
function contract(name: string, make: () => Storage | Promise<Storage>) {
  describe(`${name} storage contract`, () => {
    let storage: Storage;
    beforeAll(async () => {
      storage = await make();
    });

    it('stores a stream and reads it back with its size', async () => {
      const { size } = await storage.put(KEY, Readable.from([Buffer.from('hello '), 'world']));
      expect(size).toBe(11);
      const file = await storage.open(KEY);
      expect(file.size).toBe(11);
      expect(await text(file.body)).toBe('hello world');
    });

    it('replaces an existing object', async () => {
      await storage.put(KEY, Readable.from(['first']));
      await storage.put(KEY, Readable.from(['second']));
      expect(await text((await storage.open(KEY)).body)).toBe('second');
    });

    it('throws StorageNotFoundError for a missing key, before and after delete', async () => {
      await expect(storage.open('ws/task/missing')).rejects.toBeInstanceOf(StorageNotFoundError);
      await storage.put(KEY, Readable.from(['x']));
      await storage.delete(KEY);
      await expect(storage.open(KEY)).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it('treats deleting a missing key as success', async () => {
      await expect(storage.delete('ws/task/never-there')).resolves.toBeUndefined();
    });

    it('rejects keys that could escape the store', async () => {
      for (const key of ['../etc/passwd', 'a//b', '/abs', 'a/b/', 'a b']) {
        await expect(storage.put(key, Readable.from(['x']))).rejects.toThrow(/Invalid storage key/);
      }
    });

    it('propagates a failing source stream', async () => {
      const failing = new Readable({
        read() {
          this.destroy(new Error('client went away'));
        },
      });
      await expect(storage.put('ws/task/broken', failing)).rejects.toThrow('client went away');
    });
  });
}

/** Just enough of S3 in memory for `S3Storage` (single PUT, multipart, get, delete). */
function fakeS3() {
  const objects = new Map<string, Buffer>();
  const uploads = new Map<string, Buffer[]>();
  const sent: string[] = [];
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: 'http://s3.test',
    forcePathStyle: true,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  const toBuffer = async (body: unknown): Promise<Buffer> => {
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (typeof body === 'string') return Buffer.from(body);
    if (body instanceof Readable) return Buffer.from(await text(body));
    throw new Error('unexpected body');
  };
  const notFound = () => new NoSuchKey({ message: 'missing', $metadata: { httpStatusCode: 404 } });

  const send = async (command: unknown): Promise<unknown> => {
    sent.push((command as object).constructor.name);
    if (command instanceof PutObjectCommand) {
      objects.set(command.input.Key ?? '', await toBuffer(command.input.Body));
      return {};
    }
    if (command instanceof CreateMultipartUploadCommand) {
      const id = `upload-${uploads.size + 1}`;
      uploads.set(id, []);
      return { UploadId: id };
    }
    if (command instanceof UploadPartCommand) {
      const parts = uploads.get(command.input.UploadId ?? '');
      if (!parts) throw new Error('unknown upload');
      parts[(command.input.PartNumber ?? 1) - 1] = await toBuffer(command.input.Body);
      return { ETag: `"etag-${command.input.PartNumber}"` };
    }
    if (command instanceof CompleteMultipartUploadCommand) {
      const parts = uploads.get(command.input.UploadId ?? '');
      if (!parts) throw new Error('unknown upload');
      objects.set(command.input.Key ?? '', Buffer.concat(parts));
      uploads.delete(command.input.UploadId ?? '');
      return {};
    }
    if (command instanceof GetObjectCommand) {
      const data = objects.get(command.input.Key ?? '');
      if (!data) throw notFound();
      return { Body: Readable.from([data]), ContentLength: data.length };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key ?? '');
      return {};
    }
    throw new Error(`fake S3 doesn't handle ${(command as object).constructor.name}`);
  };
  client.send = send as S3Client['send'];
  return { client, objects, sent };
}

describe('storage', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'kite-storage-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  contract('local', () => new LocalDiskStorage(dir));
  contract('s3 (fake)', () => new S3Storage(fakeS3().client, { bucket: 'kite' }));

  describe('S3Storage', () => {
    it('writes under the prefix', async () => {
      const s3 = fakeS3();
      const storage = new S3Storage(s3.client, { bucket: 'kite', prefix: 'prod/' });
      await storage.put(KEY, Readable.from(['x']));
      expect([...s3.objects.keys()]).toEqual([`prod/${KEY}`]);
    });

    it('uses a multipart upload for files larger than one part', async () => {
      const s3 = fakeS3();
      const storage = new S3Storage(s3.client, { bucket: 'kite' });
      const chunk = Buffer.alloc(1024 * 1024, 7);
      const chunks = Array.from({ length: 6 }, () => chunk);
      const { size } = await storage.put(KEY, Readable.from(chunks));
      expect(size).toBe(6 * chunk.length);
      expect(s3.objects.get(KEY)?.length).toBe(6 * chunk.length);
      expect(s3.sent).toContain('CompleteMultipartUploadCommand');
    });
  });

  describe('createStorage', () => {
    const base = { DATABASE_URL: 'postgres://x@localhost/kite', NODE_ENV: 'test' };

    it('defaults to local disk', async () => {
      const storage = await createStorage(loadConfig({ ...base, UPLOADS_DIR: dir }));
      expect(storage).toBeInstanceOf(LocalDiskStorage);
    });

    it('builds an S3 store from the S3_* settings', async () => {
      const storage = await createStorage(
        loadConfig({
          ...base,
          STORAGE_DRIVER: 's3',
          S3_BUCKET: 'kite-files',
          S3_PREFIX: 'kite/',
          S3_ENDPOINT: 'http://minio:9000',
          S3_FORCE_PATH_STYLE: 'true',
        }),
      );
      expect(storage).toBeInstanceOf(S3Storage);
      expect((storage as S3Storage).bucket).toBe('kite-files');
      expect((storage as S3Storage).prefix).toBe('kite/');
    });

    it('requires a bucket for the s3 driver and keys in pairs', () => {
      expect(() => loadConfig({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/S3_BUCKET/);
      expect(() =>
        loadConfig({ ...base, STORAGE_DRIVER: 's3', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'id' }),
      ).toThrow(/S3_SECRET_ACCESS_KEY/);
    });
  });
});

// Against a real S3-compatible server, e.g. `docker compose --profile s3 up -d s3` and
// S3_TEST_ENDPOINT=http://127.0.0.1:8333 (that dev server accepts any credentials).
const endpoint = process.env.S3_TEST_ENDPOINT;
describe.skipIf(!endpoint)('S3Storage against S3_TEST_ENDPOINT', () => {
  contract('s3 (live)', async () => {
    const client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID ?? 'kite',
        secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY ?? 'kite-secret',
      },
    });
    const bucket = `kite-test-${Date.now()}`;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    return new S3Storage(client, { bucket });
  });
});
