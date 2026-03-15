/**
 * Воркер очереди перегенерации картинки.
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, regenerateImageQueue } from '../queue';
import { regenerateImagePipeline } from '../pipeline/regenerateImage';
import { buildContextFromPayload } from './context';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { ImageJobPayload } from '../queue/types';

const worker = new Worker<ImageJobPayload>(
  regenerateImageQueue.name,
  async (job) => {
    const { task, settings, ...ctxPayload } = job.data;
    const context = buildContextFromPayload(ctxPayload);
    await regenerateImagePipeline(task, settings, context);
  },
  { connection: connectionForBullMQ, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as ImageJobPayload | undefined;
  const msg = serializeError(err).message;
  const label = payload?.task?.headline ?? payload?.task?.keyword ?? '?';
  logInfo('Regenerate image worker error', {
    jobId: job?.id,
    label,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('RegenerateImage', 'error', `${label}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startRegenerateImageWorker(): Worker<ImageJobPayload> {
  return worker;
}
