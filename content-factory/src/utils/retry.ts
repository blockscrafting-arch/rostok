/**
 * Retry с экспоненциальной задержкой (2s → 4s → 8s + jitter).
 * После исчерпания попыток — уведомление в Telegram, запись в лист «Лог», выброс ошибки.
 */
import { config } from '../config';
import { logToSheet, serializeError } from './logger';
import { sleep } from './sleep';

let notifyFn: ((msg: string) => Promise<void>) | null = null;

export function setRetryNotifier(fn: (msg: string) => Promise<void>): void {
  notifyFn = fn;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = config.schedule.retryAttempts,
  baseDelayMs = config.schedule.retryBaseDelayMs
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        const { message } = serializeError(error);
        const msg = `❌ ${label}: все ${maxAttempts} попытки провалились.\n${message}`;
        if (notifyFn) await notifyFn(msg).catch(() => {});
        logToSheet(label, 'error', `${message}`.slice(0, 500)).catch(() => {});
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay + Math.random() * 1000);
    }
  }
  throw lastError;
}
