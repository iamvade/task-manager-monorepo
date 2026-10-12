import type { Config } from '../config.js';
import { LocalDiskStorage } from './local.js';
import type { Storage } from './storage.js';

/** The attachment store `STORAGE_DRIVER` asks for. The AWS SDK only loads for `s3`. */
export async function createStorage(config: Config): Promise<Storage> {
  if (config.STORAGE_DRIVER === 'local') return new LocalDiskStorage(config.UPLOADS_DIR);

  const [{ S3Client }, { S3Storage }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('./s3.js'),
  ]);
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint: config.S3_ENDPOINT,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
    // Without explicit keys the SDK's default chain applies (env, instance role, …).
    credentials:
      config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }
        : undefined,
  });
  // `superRefine` in config guarantees the bucket for the s3 driver.
  return new S3Storage(client, { bucket: config.S3_BUCKET ?? '', prefix: config.S3_PREFIX });
}
