import * as Minio from 'minio';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger';

const BUCKET_NAME = 'homelink';

class StorageService {
  private client: Minio.Client;

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: Number(process.env.MINIO_PORT) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'homelink_minio',
      secretKey: process.env.MINIO_SECRET_KEY || 'homelink_minio_secret',
    });

    this.initBucket();
  }

  private async initBucket(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(BUCKET_NAME);
      if (!exists) {
        await this.client.makeBucket(BUCKET_NAME, 'us-east-1');
        // Set public read policy
        const policy = JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${BUCKET_NAME}/*`],
          }],
        });
        await this.client.setBucketPolicy(BUCKET_NAME, policy);
        logger.info(`MinIO bucket '${BUCKET_NAME}' created`);
      }
    } catch (err) {
      logger.warn('MinIO bucket init failed (will retry):', err);
    }
  }

  async uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    const fileName = `${folder}/${uuidv4()}.webp`;

    // Convert to WebP and optimize
    const optimized = await sharp(file.buffer)
      .resize(1200, 900, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    await this.client.putObject(
      BUCKET_NAME,
      fileName,
      optimized,
      optimized.length,
      { 'Content-Type': 'image/webp' }
    );

    const endpoint = process.env.MINIO_PUBLIC_URL || `http://localhost:9000`;
    return `${endpoint}/${BUCKET_NAME}/${fileName}`;
  }

  async uploadFile(buffer: Buffer, fileName: string, contentType: string): Promise<string> {
    const key = `uploads/${uuidv4()}-${fileName}`;
    await this.client.putObject(BUCKET_NAME, key, buffer, buffer.length, {
      'Content-Type': contentType,
    });
    return `${process.env.MINIO_PUBLIC_URL || 'http://localhost:9000'}/${BUCKET_NAME}/${key}`;
  }

  async deleteFile(url: string): Promise<void> {
    try {
      const key = url.split(`/${BUCKET_NAME}/`)[1];
      if (key) await this.client.removeObject(BUCKET_NAME, key);
    } catch (err) {
      logger.warn('Failed to delete file from storage:', err);
    }
  }
}

export const storageService = new StorageService();
