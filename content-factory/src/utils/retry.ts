/**
 * Retry с экспоненциальной задержкой (2s → 4s → 8s + jitter).
 * После исчерпания попыток — уведомление в Telegram и выброс ошибки.
 */
import { config } from '../config';
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
        const msg = `❌ ${label}: все ${maxAttempts} попытки провалились.\n${error instanceof Error ? error.message : String(error)}`;
        if (notifyFn) await notifyFn(msg).catch(() => {});
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delay + Math.random() * 1000);
    }
  }
  throw lastError;
}
