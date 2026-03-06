/**
 * Точка входа: загрузка .env, привязка notifier к retry, graceful shutdown, запуск планировщика.
 */
import 'dotenv/config';
import { setRetryNotifier } from './utils/retry';
import { notify } from './telegram/notifier';
import { mainLoop, stopScheduler } from './scheduler/scheduler';
import { logInfo, logWarn } from './utils/logger';

setRetryNotifier(notify);

function handleShutdown(signal: string): void {
  logInfo(`Received ${signal}, shutting down gracefully...`);
  stopScheduler();
  setTimeout(() => {
    logWarn('Forced shutdown due to timeout');
    process.exit(0);
  }, 5000);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

logInfo('Content-Factory started');
mainLoop().catch((e) => {
  logInfo('Fatal', { error: e });
  process.exit(1);
});
