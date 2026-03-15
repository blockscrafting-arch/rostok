/**
 * Воркер очереди генерации картинки: текст готов → картинка → S3 → таблица.
 */
import { Worker } from 'bullmq';
import { connection } from '../queue';
import { imageQueue } from '../queue';
import { imageGenerationPipeline } from '../pipeline/imageGeneration';
import { buildContextFromPayload } from './context';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { ImageJobPayload } from '../queue/types';

const worker = new Worker<ImageJobPayload>(
  imageQueue.name,
  async (job) => {
    const { task, settings, ...ctxPayload } = job.data;
    const context = buildContextFromPayload(ctxPayload);
    await imageGenerationPipeline(task, settings, context);
  },
  { connection, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as ImageJobPayload | undefined;
  const msg = serializeError(err).message;
  const label = payload?.task?.headline ?? payload?.task?.keyword ?? '?';
  logInfo('Image worker error', {
    jobId: job?.id,
    label,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('ImageGeneration', 'error', `${label}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startImageWorker(): Worker<ImageJobPayload> {
  return worker;
}
