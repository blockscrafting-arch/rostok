/**
 * Единый экземпляр Telegraf по TELEGRAM_BOT_TOKEN:
 * уведомления, инлайн-кнопки админа, публикации в канал — один polling.
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logInfo, logWarn } from '../utils/logger';

export const appBot = new Telegraf(config.telegram.botToken);

let pollingStarted = false;

/** Запуск long polling (нужен для callback-кнопок). Идемпотентно. */
export function startAppBotPolling(): void {
  if (pollingStarted) return;
  pollingStarted = true;
  appBot
    .launch()
    .then(() => logInfo('Telegram: polling запущен (уведомления, кнопка OpenRouter)'))
    .catch((e) => {
      pollingStarted = false;
      logWarn('Telegram: polling не запущен', {
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    });
}

export async function stopAppBotPolling(): Promise<void> {
  if (!pollingStarted) return;
  try {
    await appBot.stop();
  } catch {
    /* ignore */
  }
  pollingStarted = false;
}
