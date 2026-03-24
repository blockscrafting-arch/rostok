/**
 * Отдельный Telegraf-инстанс для онбординг-бота (ONBOARDING_BOT_TOKEN).
 * Используется для уведомлений о новых клиентах и кнопки «Присвоить OpenRouter ключ».
 * Если токен не задан — все вызовы проксируются на appBot.
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { logInfo, logWarn } from '../utils/logger';
import { appBot } from './appBot';

const token = config.telegram.onboardingBotToken?.trim();

export const hasOnboardingBot = Boolean(token);

export const onboardingBot: Telegraf = token ? new Telegraf(token) : appBot;

let pollingStarted = false;

export function startOnboardingBotPolling(): void {
  if (!hasOnboardingBot || pollingStarted) return;
  pollingStarted = true;
  onboardingBot
    .launch()
    .then(() => logInfo('Onboarding bot: polling started'))
    .catch((e) => {
      pollingStarted = false;
      logWarn('Onboarding bot: polling failed', {
        errorMessage: e instanceof Error ? e.message : String(e),
      });
    });
}

export async function stopOnboardingBotPolling(): Promise<void> {
  if (!hasOnboardingBot || !pollingStarted) return;
  try {
    await onboardingBot.stop();
  } catch {
    /* ignore */
  }
  pollingStarted = false;
}
