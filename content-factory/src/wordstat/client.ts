/**
 * HTTP-клиент для Яндекс Wordstat API (OAuth-токен из Директа).
 */
import { config } from '../config';

const WORDSTAT_URL = 'https://api.direct.yandex.com/v4/json/';

export async function wordstatRequest<T>(method: string, params: unknown): Promise<T> {
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
