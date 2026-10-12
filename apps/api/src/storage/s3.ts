import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3ServiceException,
  type S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { STORAGE_KEY, StorageNotFoundError, type Storage } from './storage.js';

export interface S3StorageOptions {
  bucket: string;
  /** Prepended to every key, e.g. `kite/` to share a bucket. */
  prefix?: string;
}

const isNotFound = (err: unknown) =>
  err instanceof S3ServiceException &&
  (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.$metadata.httpStatusCode === 404);

/** Stores each object at `prefix + key` in one bucket (AWS S3, Cloudflare R2, MinIO, …). */
export class S3Storage implements Storage {
  readonly client: S3Client;
  readonly bucket: string;
  readonly prefix: string;

  constructor(client: S3Client, options: S3StorageOptions) {
    this.client = client;
    this.bucket = options.bucket;
    this.prefix = options.prefix ?? '';
  }

  objectKey(key: string): string {
    if (!STORAGE_KEY.test(key)) throw new Error(`Invalid storage key: ${key}`);
    return this.prefix + key;
  }

  async put(key: string, body: Readable): Promise<{ size: number }> {
    const Key = this.objectKey(key);
    let size = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        callback(null, chunk);
      },
    });
    // The length isn't known up front (multipart upload stream), so `Upload` buffers parts and
    // falls back to a single PUT for small files. A failing source aborts the upload.
    const upload = new Upload({
      client: this.client,
      params: { Bucket: this.bucket, Key, Body: counter, ContentType: 'application/octet-stream' },
    });
    await Promise.all([pipeline(body, counter), upload.done()]).catch(async (err: unknown) => {
      counter.destroy();
      await upload.abort().catch(() => undefined);
      throw err;
    });
    return { size };
  }

  async open(key: string): Promise<{ body: Readable; size: number }> {
    const Key = this.objectKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key }));
      if (!(res.Body instanceof Readable)) throw new Error(`S3 returned no stream for ${key}`);
      return { body: res.Body, size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    // S3 deletes are idempotent: a missing key succeeds.
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }),
    );
  }
}
