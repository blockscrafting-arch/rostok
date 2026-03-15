/**
 * Запуск всех воркеров BullMQ (обработка очередей пайплайнов).
 * closeWorkers() — для graceful shutdown (закрытие воркеров перед выходом).
 */
import type { Worker } from 'bullmq';
import { logInfo } from '../utils/logger';
import { startSemanticsWorker } from './semanticsWorker';
import { startGenerationWorker } from './generationWorker';
import { startImageWorker } from './imageWorker';
import { startRegenerateImageWorker } from './regenerateImageWorker';
import { startPublishWorker } from './publishWorker';

const workers: Worker[] = [];

export function startWorkers(): void {
  workers.push(
    startSemanticsWorker(),
    startGenerationWorker(),
    startImageWorker(),
    startRegenerateImageWorker(),
    startPublishWorker()
  );
  logInfo('BullMQ workers started (semantics, generation, image, regenerateImage, publish)');
}

export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
}
