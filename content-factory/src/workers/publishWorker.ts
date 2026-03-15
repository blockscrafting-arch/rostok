/**
 * Воркер очереди публикации: одобренная статья → Telegram → статус «Опубликовано».
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, publishQueue } from '../queue';
import { publishingPipeline } from '../pipeline/publishing';
import { buildContextFromPayload } from './context';
import { loadTaskAndSettings } from './loadJobData';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { PublishJobPayload } from '../queue/types';

const worker = new Worker<PublishJobPayload>(
  publishQueue.name,
  async (job) => {
    const { task } = await loadTaskAndSettings(job.data);
    const context = buildContextFromPayload(job.data);
    await publishingPipeline(task, context);
  },
  { connection: connectionForBullMQ, concurrency: 1 }
);

worker.on('failed', (job, err) => {
  const maxAttempts = job?.opts?.attempts ?? 1;
  if (job && job.attemptsMade < maxAttempts) {
    logInfo('Publish worker attempt failed, will retry', { jobId: job.id, attemptsMade: job.attemptsMade, maxAttempts });
    return;
  }
  const payload = job?.data as PublishJobPayload | undefined;
  const msg = serializeError(err).message;
  logInfo('Publish worker error', {
    jobId: job?.id,
    rowIndex: payload?.rowIndex,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('Publish', 'error', `row ${payload?.rowIndex ?? '?'}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startPublishWorker(): Worker<PublishJobPayload> {
  return worker;
}
