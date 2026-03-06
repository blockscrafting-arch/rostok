/**
 * HTTP-клиент для Яндекс Wordstat API (OAuth-токен из Директа).
 * Обработка 429 (Retry-After) и 503 (exponential backoff).
 */
import { config } from '../config';

const WORDSTAT_URL = 'https://api.direct.yandex.com/v4/json/';
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function wordstatRequest<T>(method: string, params: unknown): Promise<T> {
  let lastError: Error | null = null;
  let backoffMs = INITIAL_BACKOFF_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(WORDSTAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.yandex.oauthToken}`,
      },
      body: JSON.stringify({
        method,
        param: params,
        token: config.yandex.oauthToken,
      }),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : backoffMs;
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(waitMs, 60_000));
        continue;
      }
      lastError = new Error(`Wordstat ${method}: 429 Too Many Requests`);
      break;
    }

    if (res.status === 503) {
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60_000);
        continue;
      }
      lastError = new Error(`Wordstat ${method}: 503 Service Unavailable`);
      break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wordstat ${method}: ${res.status} ${text}`);
    }

    const data = (await res.json()) as { error_code?: number; error_str?: string; data?: T };
    if (data.error_code) {
      throw new Error(`Wordstat ${method}: ${data.error_str ?? data.error_code}`);
    }
    return data.data as T;
  }

  throw lastError ?? new Error(`Wordstat ${method}: unknown error`);
}
