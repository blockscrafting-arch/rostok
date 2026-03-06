/**
 * Сбор НЧ-запросов: CreateNewWordstatReport → поллинг GetWordstatReportList → GetWordstatReport.
 */
import { wordstatRequest } from './client';
import type { WordstatKeywordItem } from './types';
import { sleep } from '../utils/sleep';
import { logWarn } from '../utils/logger';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 60;

/**
 * Создать отчёт по ключевому слову.
 */
async function createReport(phrase: string): Promise<number> {
  const data = await wordstatRequest<number>('CreateNewWordstatReport', {
    Phrases: [phrase],
  });
  return Array.isArray(data) ? data[0] : data;
}

/**
 * Статус отчёта: Done | Pending | Failed.
 */
async function getReportStatus(reportID: number): Promise<string> {
  const list = await wordstatRequest<{ reportID: number; status: string }[]>(
    'GetWordstatReportList',
    {}
  );
  const report = list?.find((r) => r.reportID === reportID);
  return report?.status ?? 'Pending';
}

/**
 * Скачать отчёт (массив строк вида "keyword\tfrequency" или объекты).
 */
async function getReport(reportID: number): Promise<WordstatKeywordItem[]> {
  const data = await wordstatRequest<unknown>('GetWordstatReport', { reportID });
  const items: WordstatKeywordItem[] = [];
  if (Array.isArray(data)) {
    for (const row of data) {
      if (typeof row === 'string') {
        const [keyword, freq] = row.split('\t');
        if (keyword) items.push({ keyword: keyword.trim(), frequency: parseInt(freq || '0', 10) || 0 });
      } else if (row && typeof row === 'object' && 'Keyword' in row) {
        const r = row as { Keyword?: string; Shows?: number };
        items.push({ keyword: r.Keyword ?? '', frequency: r.Shows ?? 0 });
      }
    }
  }
  return items;
}

/**
 * По ключевой фразе получить список НЧ-запросов с частотностью, отфильтровать по лимиту частотности.
 */
export async function fetchKeywords(
  phrase: string,
  frequencyLimit: number
): Promise<WordstatKeywordItem[]> {
  const reportID = await createReport(phrase);
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    const status = await getReportStatus(reportID);
    if (status === 'Done') {
      const items = await getReport(reportID);
      return items.filter((item) => item.frequency >= frequencyLimit);
    }
    if (status === 'Failed') {
      logWarn('Wordstat report failed', { reportID });
      return [];
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('Wordstat report timeout');
}
