/**
 * Воркер очереди публикации: одобренная статья → Telegram → статус «Опубликовано».
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, publishQueue } from '../queue';
import { publishingPipeline } from '../pipeline/publishing';
import { buildContextFromPayload } from './context';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { PublishJobPayload } from '../queue/types';

const worker = new Worker<PublishJobPayload>(
  publishQueue.name,
  async (job) => {
    const { task, ...ctxPayload } = job.data;
    const context = buildContextFromPayload(ctxPayload);
    await publishingPipeline(task, context);
  },
  { connection: connectionForBullMQ, concurrency: 1 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as PublishJobPayload | undefined;
  const msg = serializeError(err).message;
  const label = payload?.task?.headline ?? payload?.task?.keyword ?? '?';
  logInfo('Publish worker error', {
    jobId: job?.id,
    label,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('Publish', 'error', `${label}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startPublishWorker(): Worker<PublishJobPayload> {
  return worker;
}
