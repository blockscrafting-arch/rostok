/**
 * Точка входа: загрузка .env, привязка notifier к retry, запуск планировщика.
 */
import 'dotenv/config';
import { setRetryNotifier } from './utils/retry';
import { notify } from './telegram/notifier';
import { mainLoop } from './scheduler/scheduler';
import { logInfo } from './utils/logger';

setRetryNotifier(notify);

logInfo('Content-Factory started');
mainLoop().catch((e) => {
  logInfo('Fatal', { error: e });
  process.exit(1);
});
