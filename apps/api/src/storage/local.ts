import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StorageNotFoundError, type Storage } from './storage.js';

const KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/;

const isNotFound = (err: unknown) =>
  err instanceof Error && 'code' in err && (err.code === 'ENOENT' || err.code === 'ENOTDIR');

/** Stores each object as a file at `root/<key>`. */
export class LocalDiskStorage implements Storage {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Path of a key; keys are plain segments, so the path can't leave `root`. */
  pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!KEY.test(key) || !path.startsWith(this.root + sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return path;
  }

  async put(key: string, body: Readable): Promise<{ size: number }> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    try {
      await pipeline(body, createWriteStream(path));
    } catch (err) {
      await rm(path, { force: true });
      throw err;
    }
    return { size: (await stat(path)).size };
  }

  async open(key: string): Promise<{ body: Readable; size: number }> {
    const path = this.pathOf(key);
    try {
      const info = await stat(path);
      if (!info.isFile()) throw new StorageNotFoundError(key);
      return { body: createReadStream(path), size: info.size };
    } catch (err) {
      if (isNotFound(err)) throw new StorageNotFoundError(key);
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
