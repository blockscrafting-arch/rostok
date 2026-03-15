/**
 * Воркер очереди генерации текста: заголовок → граундинг → черновик → очеловечивание → таблица.
 */
import { Worker } from 'bullmq';
import { connectionForBullMQ, generationQueue } from '../queue';
import { generationPipeline } from '../pipeline/generation';
import { buildContextFromPayload } from './context';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import type { GenerationJobPayload } from '../queue/types';

const worker = new Worker<GenerationJobPayload>(
  generationQueue.name,
  async (job) => {
    const { task, settings, options, ...ctxPayload } = job.data;
    const context = buildContextFromPayload(ctxPayload);
    await generationPipeline(task, settings, options ?? {}, context);
  },
  { connection: connectionForBullMQ, concurrency: 2 }
);

worker.on('failed', (job, err) => {
  const payload = job?.data as GenerationJobPayload | undefined;
  const msg = serializeError(err).message;
  const label = payload?.task?.headline ?? payload?.task?.keyword ?? '?';
  logInfo('Generation worker error', {
    jobId: job?.id,
    label,
    errorMessage: msg,
    responsePreview: getApiErrorResponsePreview(err),
  });
  const logSheetOpt = payload?.spreadsheetId ? { spreadsheetId: payload.spreadsheetId } : undefined;
  logToSheet('Generation', 'error', `${label}: ${msg}`.slice(0, 500), logSheetOpt).catch(() => {});
});

export function startGenerationWorker(): Worker<GenerationJobPayload> {
  return worker;
}
