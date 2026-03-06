/**
 * Сбор НЧ-запросов через API Вордстата (api.wordstat.yandex.net).
 * Один запрос /v1/topRequests — без поллинга и отчётов Директа.
 */
import { config } from '../config';
import { topRequests } from './client';
import type { WordstatKeywordItem } from './types';
import { logWarn } from '../utils/logger';

const DEFAULT_NUM_PHRASES = 150;

/**
 * По ключевой фразе получить список НЧ-запросов с частотностью, отфильтровать по лимиту.
 */
export async function fetchKeywords(
  phrase: string,
  frequencyLimit: number
): Promise<WordstatKeywordItem[]> {
  if (!config.yandex.oauthToken.trim()) {
    logWarn('YANDEX_OAUTH_TOKEN is not set, skipping Wordstat', { phrase });
    return [];
  }
  try {
    const data = await topRequests(phrase, DEFAULT_NUM_PHRASES);
    const seen = new Set<string>();
    const items: WordstatKeywordItem[] = [];

    for (const { phrase: p, count } of data.topRequests ?? []) {
      const key = p.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({ keyword: p.trim(), frequency: count });
      }
    }
    for (const { phrase: p, count } of data.associations ?? []) {
      const key = p.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        items.push({ keyword: p.trim(), frequency: count });
      }
    }

    return items.filter((item) => item.frequency >= frequencyLimit);
  } catch (e) {
    logWarn('Wordstat topRequests failed', { phrase, error: e });
    throw e;
  }
}
