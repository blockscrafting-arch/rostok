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
import { openrouter } from '../ai/client';
import { totalCostUsd } from '../ai/cost';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
import type { SheetTask, Settings, PipelineContext } from '../types';

const MAX_KEYWORD_LENGTH = 500;

export async function semanticsPipeline(
  task: SheetTask,
  settings: Settings,
  context?: PipelineContext
): Promise<void> {
  if (task.status !== 'Новое' || !task.keyword) return;

  const aiClient = context?.aiClient ?? openrouter;
  const sheetCtx = context?.sheetContext;

  const keywordSafe = task.keyword.slice(0, MAX_KEYWORD_LENGTH);
  try {
    await updateStatus(task, 'Генерация', sheetCtx);
    const keywordList = await withRetry(
      () => fetchKeywords(keywordSafe, task.frequencyLimit),
      'Wordstat'
    );
    const kwStrings = keywordList.map((k) => k.keyword.slice(0, MAX_KEYWORD_LENGTH));
    const { items, usage } = await withRetry(
      () =>
        generateHeadlines(
          aiClient,
          keywordSafe,
          kwStrings,
          settings.prompt1,
          settings.headlinesCount ?? 30,
          settings.textModel
        ),
      'Headlines'
    );
    const validKwSet = new Set(kwStrings.map((k) => k.toLowerCase()));
    const filteredItems = items.map((item) => {
      const filtered = item.keywords.filter((k) => validKwSet.has(k.trim().toLowerCase()));
      const keywords = filtered.length > 0 ? filtered : kwStrings.slice(0, 10);
      return { ...item, keywords };
    });

    const headlinesCostUsd = totalCostUsd([usage]);
    const costPerRow = filteredItems.length > 0 ? headlinesCostUsd / filteredItems.length : 0;

    const first = filteredItems[0];
    await writeKeywords(task, first?.keywords ?? [], sheetCtx);
    await writeHeadlines(task, first?.headline ? [first.headline] : [], sheetCtx);
    await writeHeadlinesCost(task, costPerRow, sheetCtx);
    await updateStatus(task, 'На согласовании', sheetCtx);
    if (filteredItems.length > 1) {
      await insertTaskRows(task, filteredItems.slice(1), costPerRow, sheetCtx);
    }
    logInfo('Semantics done', { keyword: task.keyword, headlinesCount: filteredItems.length, headlinesCostUsd });
  } catch (error) {
    await setStatusError(task, sheetCtx);
    throw error;
  }
}
