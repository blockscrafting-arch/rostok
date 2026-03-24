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
import { config } from './config';
import { logInfo, logWarn, serializeError } from './utils/logger';
import { registerAdminOpenRouterKeyHandlers } from './telegram/adminOpenRouterKey';
import { startAppBotPolling, stopAppBotPolling } from './telegram/appBot';
import { startOnboardingBotPolling, stopOnboardingBotPolling } from './telegram/onboardingBot';

setRetryNotifier(notify);

/** Подсказка в логах: copy шаблона без OAuth = JWT SA → storageQuotaExceeded в личных папках Drive. */
function logGoogleDriveTemplateCopyHint(): void {
  const g = config.google;
  const tpl = g.templateSpreadsheetId?.trim();
  const main = g.spreadsheetId?.trim();
  if (tpl && main && tpl === main) {
    logWarn(
      'TEMPLATE_SPREADSHEET_ID совпадает с SPREADSHEET_ID — онбординг будет падать при createClientTable или копировать не тот файл. Задайте отдельный ID шаблона.'
    );
  }
  const id = Boolean(g.driveCopyOAuthClientId?.trim());
  const secret = Boolean(g.driveCopyOAuthClientSecret?.trim());
  const rt = Boolean(g.driveCopyOAuthRefreshToken?.trim());
  if (id && secret && rt) {
    logInfo(
      'Google Drive: копирование шаблона клиента — OAuth пользователя (не JWT сервисного аккаунта)'
    );
    return;
  }
  const missing = [
    !id && 'GOOGLE_DRIVE_COPY_OAUTH_CLIENT_ID',
    !secret && 'GOOGLE_DRIVE_COPY_OAUTH_CLIENT_SECRET',
    !rt && 'GOOGLE_DRIVE_COPY_OAUTH_REFRESH_TOKEN',
  ].filter(Boolean) as string[];
  if (missing.length === 3) {
    logWarn(
      'Google Drive: не заданы GOOGLE_DRIVE_COPY_OAUTH_* (все три) — copy шаблона идёт от сервисного аккаунта; в стеке будет JWT → типично storageQuotaExceeded. Добавьте переменные в .env на сервере и перезапустите app.'
    );
  } else {
    logWarn(
      `Google Drive: OAuth для copy задан неполностью (как у SA). Добавьте в .env: ${missing.join(', ')}`
    );
  }
}

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
    stopAppBotPolling(),
    stopOnboardingBotPolling(),
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
logGoogleDriveTemplateCopyHint();
registerAdminOpenRouterKeyHandlers();
startAppBotPolling();
startOnboardingBotPolling();
startWorkers();
void startApiServer();
mainLoop().catch((e) => {
  logInfo('Fatal', { errorMessage: serializeError(e).message });
  process.exit(1);
});
