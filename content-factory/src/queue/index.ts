/**
 * Очереди BullMQ (аналог Celery): планировщик добавляет задачи, воркеры их обрабатывают.
 * Приведение типа connection для BullMQ устраняет конфликт двух копий ioredis (проект + вложенная в bullmq) в CI.
 * defaultJobOptions: автоповтор при сбоях API (attempts + exponential backoff).
 */
import { Queue } from 'bullmq';
import type { ConnectionOptions, DefaultJobOptions } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });

/** То же соединение, с типом BullMQ (избегаем TS2322 из-за двух версий ioredis в дереве зависимостей). */
const connectionForBullMQ = connection as ConnectionOptions;

const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
};

export { connection };

export const semanticsQueue = new Queue('semantics', { connection: connectionForBullMQ, defaultJobOptions });
export const generationQueue = new Queue('generation', { connection: connectionForBullMQ, defaultJobOptions });
export const imageQueue = new Queue('image_generation', { connection: connectionForBullMQ, defaultJobOptions });
export const regenerateImageQueue = new Queue('regenerate_image', { connection: connectionForBullMQ, defaultJobOptions });
export const publishQueue = new Queue('publishing', { connection: connectionForBullMQ, defaultJobOptions });

export { connectionForBullMQ };
