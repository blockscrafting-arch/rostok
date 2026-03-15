/**
 * Очереди BullMQ (аналог Celery): планировщик добавляет задачи, воркеры их обрабатывают.
 * Приведение типа connection для BullMQ устраняет конфликт двух копий ioredis (проект + вложенная в bullmq) в CI.
 */
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });

/** То же соединение, с типом BullMQ (избегаем TS2322 из-за двух версий ioredis в дереве зависимостей). */
const connectionForBullMQ = connection as ConnectionOptions;

export { connection };

export const semanticsQueue = new Queue('semantics', { connection: connectionForBullMQ });
export const generationQueue = new Queue('generation', { connection: connectionForBullMQ });
export const imageQueue = new Queue('image_generation', { connection: connectionForBullMQ });
export const regenerateImageQueue = new Queue('regenerate_image', { connection: connectionForBullMQ });
export const publishQueue = new Queue('publishing', { connection: connectionForBullMQ });

export { connectionForBullMQ };
