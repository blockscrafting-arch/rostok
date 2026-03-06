/**
 * Главный цикл: polling Google Sheets, запуск пайплайнов по статусам.
 * Учёт maxArticlesPerDay, вызов ежедневной сводки по dailySummaryTime.
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { getTodayStats } from '../sheets/statistics';
import { semanticsPipeline } from '../pipeline/semantics';
import { generationPipeline } from '../pipeline/generation';
import { publishingPipeline } from '../pipeline/publishing';
import { sendDailySummary } from '../telegram/notifier';
import { sleep } from '../utils/sleep';
import { logInfo } from '../utils/logger';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Проверка: наступило ли время сводки (например "21:00"). */
function isAfterSummaryTime(summaryTime: string): boolean {
  const [h, m] = summaryTime.split(':').map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const targetM = h * 60 + m;
  return nowM >= targetM;
}

export async function mainLoop(): Promise<void> {
  let publishedToday = 0;
  let lastDateKey = '';
  let dailySummarySentDate = '';
  const dailyErrors: string[] = [];

  while (true) {
    try {
      const settings = await readSettings();
      const tasks = await readTasks();
      const today = todayKey();

      if (today !== lastDateKey) {
        publishedToday = 0;
        lastDateKey = today;
      }

      for (const task of tasks.filter((t) => t.status === 'Новое')) {
        try {
          await semanticsPipeline(task, settings);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          dailyErrors.push(`Semantics: ${task.keyword} — ${msg}`);
          logInfo('Semantics pipeline error', { task: task.keyword, error: e });
        }
      }

      for (const task of tasks.filter((t) => t.status === 'Согласовано')) {
        try {
          await generationPipeline(task, settings, { isRevision: false });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          dailyErrors.push(`Generation: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Generation pipeline error', { task: task.headline, error: e });
        }
      }

      for (const task of tasks.filter((t) => t.status === 'На доработку')) {
        try {
          await generationPipeline(task, settings, {
            isRevision: true,
            editorComment: task.comment ?? undefined,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          dailyErrors.push(`Revision: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Revision pipeline error', { task: task.headline, error: e });
        }
      }

      const approved = tasks.filter((t) => t.status === 'Одобрено');
      const limit = Math.max(0, settings.maxArticlesPerDay - publishedToday);
      const toPublish = approved.slice(0, limit);
      for (const task of toPublish) {
        try {
          await publishingPipeline(task);
          publishedToday += 1;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          dailyErrors.push(`Publish: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Publishing pipeline error', { task: task.headline, error: e });
        }
      }

      if (
        dailySummarySentDate !== today &&
        isAfterSummaryTime(settings.dailySummaryTime)
      ) {
        try {
          const { count, totalCostRub } = await getTodayStats();
          await sendDailySummary(count, totalCostRub, dailyErrors.length ? dailyErrors : undefined);
          dailySummarySentDate = today;
          dailyErrors.length = 0;
        } catch (e) {
          logInfo('Daily summary error', { error: e });
        }
      }

      await sleep(settings.pollInterval);
    } catch (e) {
      logInfo('Main loop error', { error: e });
      await sleep(60_000);
    }
  }
}
