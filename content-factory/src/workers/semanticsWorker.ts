/**
 * Воркер очереди семантики: ключевое слово → заголовки → таблица.
 */
import { Worker } from 'bullmq';
import { connection } from '../queue';
import { semanticsQueue } from '../queue';
import { semanticsPipeline } from '../pipeline/semantics';
import { buildContextFromPayload } from './context';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { SemanticsJobPayload } from '../queue/types';

const worker = new Worker<SemanticsJobPayload>(
  semanticsQueue.name,
  async (job) => {
    const { task, settings, ...ctxPayload } = job.data;
    const context = buildContextFromPayload(ctxPayload);
    await semanticsPipeline(task, settings, context);
  },
  { connection, concurrency: 3 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as SemanticsJobPayload | undefined;
  const msg = serializeError(err).message;
  logInfo('Semantics worker error', {
    jobId: job?.id,
    keyword: payload?.task?.keyword,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('Semantics', 'error', `${payload?.task?.keyword ?? '?'}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startSemanticsWorker(): Worker<SemanticsJobPayload> {
  return worker;
}
