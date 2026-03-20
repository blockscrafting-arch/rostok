/**
 * Точка входа: загрузка .env, привязка notifier к retry, graceful shutdown, запуск планировщика.
 */
import 'dotenv/config';
import { setRetryNotifier } from './utils/retry';
import { notify } from './telegram/notifier';
import { mainLoop, stopScheduler } from './scheduler/scheduler';
import { startWorkers, closeWorkers } from './workers';
import { connection } from './queue';
import { getApiServer, startApiServer } from './api/server';
import { logInfo, logWarn, serializeError } from './utils/logger';

setRetryNotifier(notify);

function handleShutdown(signal: string): void {
  logInfo(`Received ${signal}, shutting down gracefully...`);
  stopScheduler();
  let exited = false;
  function exit(): void {
    if (!exited) {
      exited = true;
      process.exit(0);
    }
  }
  const closePromises: Promise<unknown>[] = [
    closeWorkers(),
    connection.quit().catch(() => {}),
  ];
  const api = getApiServer();
  if (api) {
    closePromises.push(api.close());
  }
  Promise.all(closePromises).finally(exit);
  setTimeout(() => {
    logWarn('Forced shutdown due to timeout');
    exit();
  }, 5000);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

logInfo('Content-Factory started');
startWorkers();
void startApiServer();
mainLoop().catch((e) => {
  logInfo('Fatal', { errorMessage: serializeError(e).message });
  process.exit(1);
});
