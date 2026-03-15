/**
 * Воркер очереди семантики: ключевое слово → заголовки → таблица.
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, semanticsQueue } from '../queue';
import { semanticsPipeline } from '../pipeline/semantics';
import { buildContextFromPayload } from './context';
import { loadTaskAndSettings } from './loadJobData';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { SemanticsJobPayload } from '../queue/types';

const worker = new Worker<SemanticsJobPayload>(
  semanticsQueue.name,
  async (job) => {
    const { task, settings } = await loadTaskAndSettings(job.data);
    const context = buildContextFromPayload(job.data);
    await semanticsPipeline(task, settings, context);
  },
  { connection: connectionForBullMQ, concurrency: 3 }
);

worker.on('failed', (job, err) => {
  const maxAttempts = job?.opts?.attempts ?? 1;
  if (job && job.attemptsMade < maxAttempts) {
    logInfo('Semantics worker attempt failed, will retry', { jobId: job.id, attemptsMade: job.attemptsMade, maxAttempts });
    return;
  }
  const payload = job?.data as SemanticsJobPayload | undefined;
  const msg = serializeError(err).message;
  logInfo('Semantics worker error', {
    jobId: job?.id,
    rowIndex: payload?.rowIndex,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('Semantics', 'error', `row ${payload?.rowIndex ?? '?'}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startSemanticsWorker(): Worker<SemanticsJobPayload> {
  return worker;
}
