/**
 * Пайплайн: ключевое слово → Wordstat → заголовки → таблица (статус «На согласовании»).
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import {
  updateStatus,
  writeHeadlines,
  writeKeywords,
  writeHeadlinesCost,
  insertTaskRows,
  setStatusError,
} from '../sheets/writer';
import { fetchKeywords } from '../wordstat/keywords';
import { generateHeadlines } from '../ai/headlines';
import { totalCostUsd } from '../ai/cost';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
import type { Task } from '../types';
import type { Settings } from '../types';

const MAX_KEYWORD_LENGTH = 500;

export async function semanticsPipeline(task: Task, settings: Settings): Promise<void> {
  if (task.status !== 'Новое' || !task.keyword) return;

  const keywordSafe = task.keyword.slice(0, MAX_KEYWORD_LENGTH);
  try {
    await updateStatus(task, 'Генерация');
    const keywordList = await withRetry(
      () => fetchKeywords(keywordSafe, task.frequencyLimit),
      'Wordstat'
    );
    const kwStrings = keywordList.map((k) => k.keyword.slice(0, MAX_KEYWORD_LENGTH));
    const { items, usage } = await withRetry(
      () => generateHeadlines(keywordSafe, kwStrings, settings.prompt1),
      'Headlines'
    );
    const headlinesCostUsd = totalCostUsd([usage]);
    const costPerRow = items.length > 0 ? headlinesCostUsd / items.length : 0;

    const first = items[0];
    await writeKeywords(task, first?.keywords ?? []);
    await writeHeadlines(task, first?.headline ? [first.headline] : []);
    await writeHeadlinesCost(task, costPerRow);
    await updateStatus(task, 'На согласовании');
    if (items.length > 1) {
      await insertTaskRows(task, items.slice(1), costPerRow);
    }
    logInfo('Semantics done', { keyword: task.keyword, headlinesCount: items.length, headlinesCostUsd });
  } catch (error) {
    await setStatusError(task);
    throw error;
  }
}
