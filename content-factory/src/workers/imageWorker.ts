/**
 * Воркер очереди генерации картинки: текст готов → картинка → S3 → таблица.
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, imageQueue } from '../queue';
import { imageGenerationPipeline } from '../pipeline/imageGeneration';
import { buildContextFromPayload } from './context';
import { loadTaskAndSettings } from './loadJobData';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { ImageJobPayload } from '../queue/types';

const worker = new Worker<ImageJobPayload>(
  imageQueue.name,
  async (job) => {
    const { task, settings } = await loadTaskAndSettings(job.data);
    const context = buildContextFromPayload(job.data);
    await imageGenerationPipeline(task, settings, context);
  },
  { connection: connectionForBullMQ, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as ImageJobPayload | undefined;
  const msg = serializeError(err).message;
  logInfo('Image worker error', {
    jobId: job?.id,
    rowIndex: payload?.rowIndex,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('ImageGeneration', 'error', `row ${payload?.rowIndex ?? '?'}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startImageWorker(): Worker<ImageJobPayload> {
  return worker;
}
