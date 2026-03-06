/**
 * Клиент API Вордстата (api.wordstat.yandex.net).
 * Метод /v1/topRequests — популярные и похожие запросы по фразе. Один запрос, без поллинга.
 * Обработка 429 (Retry-After) и 503 (exponential backoff).
 * Документация: https://yandex.ru/support2/wordstat/ru/content/api-structure
 */
import { config } from '../config';

const WORDSTAT_BASE = 'https://api.wordstat.yandex.net/v1';
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export interface TopRequestsResponse {
  requestPhrase: string;
  totalCount: number;
  topRequests: Array<{ phrase: string; count: number }>;
  associations: Array<{ phrase: string; count: number }>;
}

async function requestWithRetry(
  url: string,
  body: object,
  attemptLabel: string
): Promise<unknown> {
  let backoffMs = INITIAL_BACKOFF_MS;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${config.yandex.oauthToken}`,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      const text = await res.text().catch(() => '');
      const m = text.match(/time to refill:\s*(\d+)\s*seconds/i);
      const refillMs = m ? parseInt(m[1], 10) * 1000 : 0;
      const waitMs =
        refillMs > 0
          ? refillMs
          : retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : backoffMs;
      if (attempt < MAX_RETRIES) {
        await sleep(Math.min(waitMs, 60_000) + Math.random() * 250);
        continue;
      }
      throw new Error(`Wordstat: 429 Quota limit exceeded ${text}`.trim());
    }

    if (res.status === 503) {
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 60_000);
        continue;
      }
      throw new Error(`Wordstat: 503 Service Unavailable`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Wordstat ${attemptLabel}: ${res.status} ${text}`);
    }

    return res.json();
  }
  throw new Error(`Wordstat ${attemptLabel}: max retries exceeded`);
}

/**
 * Популярные запросы, содержащие фразу, и похожие запросы (за последние 30 дней).
 */
export async function topRequests(
  phrase: string,
  numPhrases = 100
): Promise<TopRequestsResponse> {
  const data = (await requestWithRetry(
    `${WORDSTAT_BASE}/topRequests`,
    { phrase, numPhrases },
    'topRequests'
  )) as TopRequestsResponse | { error?: string };

  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(`Wordstat topRequests: ${data.error}`);
  }
  return data as TopRequestsResponse;
}
