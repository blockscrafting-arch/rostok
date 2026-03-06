/**
 * Загрузка изображений в Beget S3 (AWS SDK).
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import { logWarn } from '../utils/logger';

if (!config.s3.accessKey?.trim() || !config.s3.secretKey?.trim()) {
  logWarn('S3 credentials missing. Image upload will fail or be skipped.');
}

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

/**
 * Загрузить буфер картинки в S3, вернуть публичную ссылку.
 */
export async function uploadImage(buffer: Buffer, key: string): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/png',
      ACL: 'public-read',
    })
  );
  const base = config.s3.endpoint.replace(/\/$/, '');
  return `${base}/${config.s3.bucket}/${key}`;
}
