/**
 * Сбор НЧ-запросов через API Вордстата (api.wordstat.yandex.net).
 * Один запрос /v1/topRequests — без поллинга и отчётов Директа.
 * Лимит частотности: число = минимум (>=), "min-max" = диапазон (>= min и <= max).
 */
import { config } from '../config';
import { topRequests } from './client';
import type { WordstatKeywordItem } from './types';
import type { FrequencyLimit } from '../types';
import { logWarn } from '../utils/logger';

/** Запрашивать больше фраз, чтобы после фильтра по диапазону осталось достаточно. */
const DEFAULT_NUM_PHRASES = 500;

function inRange(frequency: number, limit: FrequencyLimit): boolean {
  if (typeof limit === 'number') return frequency >= limit;
  return frequency >= limit.min && frequency <= limit.max;
}

/**
 * По ключевой фразе получить список НЧ-запросов с частотностью, отфильтровать по лимиту.
 * Лимит из ячейки: 300 — только запросы с частотой >= 300; "300-500" — только в диапазоне 300..500.
 */
export async function fetchKeywords(
  phrase: string,
  frequencyLimit: FrequencyLimit
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

    return items.filter((item) => inRange(item.frequency, frequencyLimit));
  } catch (e) {
    logWarn('Wordstat topRequests failed', { phrase, errorMessage: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
