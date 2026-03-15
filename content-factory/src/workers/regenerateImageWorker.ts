/**
 * Воркер очереди перегенерации картинки.
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, regenerateImageQueue } from '../queue';
import { regenerateImagePipeline } from '../pipeline/regenerateImage';
import { buildContextFromPayload } from './context';
import { loadTaskAndSettings } from './loadJobData';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { RegenerateImageJobPayload } from '../queue/types';

const worker = new Worker<RegenerateImageJobPayload>(
  regenerateImageQueue.name,
  async (job) => {
    const { task, settings } = await loadTaskAndSettings(job.data);
    const context = buildContextFromPayload(job.data);
    await regenerateImagePipeline(task, settings, context);
  },
  { connection: connectionForBullMQ, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  const maxAttempts = job?.opts?.attempts ?? 1;
  if (job && job.attemptsMade < maxAttempts) {
    logInfo('Regenerate image worker attempt failed, will retry', { jobId: job.id, attemptsMade: job.attemptsMade, maxAttempts });
    return;
  }
  const payload = job?.data as RegenerateImageJobPayload | undefined;
  const msg = serializeError(err).message;
  logInfo('Regenerate image worker error', {
    jobId: job?.id,
    rowIndex: payload?.rowIndex,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('RegenerateImage', 'error', `row ${payload?.rowIndex ?? '?'}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startRegenerateImageWorker(): Worker<RegenerateImageJobPayload> {
  return worker;
}
