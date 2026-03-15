/**
 * Очереди BullMQ (аналог Celery): планировщик добавляет задачи, воркеры их обрабатывают.
 */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null });

export { connection };

export const semanticsQueue = new Queue('semantics', { connection });
export const generationQueue = new Queue('generation', { connection });
export const imageQueue = new Queue('image_generation', { connection });
export const regenerateImageQueue = new Queue('regenerate_image', { connection });
export const publishQueue = new Queue('publishing', { connection });
