/**
 * Главный цикл: polling Google Sheets, запуск пайплайнов по статусам.
 * Учёт maxArticlesPerDay, вызов ежедневной сводки по dailySummaryTime.
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { semanticsPipeline } from '../pipeline/semantics';
import { generationPipeline } from '../pipeline/generation';
import { imageGenerationPipeline } from '../pipeline/imageGeneration';
import { regenerateImagePipeline } from '../pipeline/regenerateImage';
import { publishingPipeline } from '../pipeline/publishing';
import { sendDailySummary } from '../telegram/notifier';
import { sleep } from '../utils/sleep';
import { logInfo, logToSheet, serializeError } from '../utils/logger';

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

/** Проверка: наступило ли заданное время суток (например "05:00"). */
function isAfterTime(timeStr: string): boolean {
  const [h, m] = timeStr.split(':').map((x) => parseInt(x, 10) || 0);
  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const targetM = h * 60 + m;
  return nowM >= targetM;
}

let isRunning = true;

export function stopScheduler(): void {
  isRunning = false;
}

export async function mainLoop(): Promise<void> {
  let publishedToday = 0;
  let lastDateKey = '';
  let lastPublishedAt = 0;
  let dailySummarySentDate = '';
  const dailyErrors: string[] = [];

  while (isRunning) {
    try {
      const settings = await readSettings();
      const tasks = await readTasks();
      const today = todayKey();

      if (today !== lastDateKey) {
        publishedToday = 0;
        lastPublishedAt = 0;
        lastDateKey = today;
      }

      for (const task of tasks.filter((t) => t.status === 'Новое').reverse()) {
        try {
          await semanticsPipeline(task, settings);
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Semantics: ${task.keyword} — ${msg}`);
          logInfo('Semantics pipeline error', { task: task.keyword, error: e });
          logToSheet('Semantics', 'error', `${task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      for (const task of tasks.filter((t) => t.status === 'Согласован заголовок')) {
        try {
          await generationPipeline(task, settings, { isRevision: false });
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Generation: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Generation pipeline error', { task: task.headline, error: e });
          logToSheet('Generation', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      const canRunImageGeneration = isAfterTime(settings.generationTime);
      for (const task of tasks.filter((t) => t.status === 'Текст готов, ждём картинку')) {
        if (!canRunImageGeneration) break;
        try {
          await imageGenerationPipeline(task, settings);
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Image: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Image generation pipeline error', { task: task.headline, error: e });
          logToSheet('ImageGeneration', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      for (const task of tasks.filter((t) => t.status === 'На доработку')) {
        try {
          await generationPipeline(task, settings, {
            isRevision: true,
            editorComment: task.comment ?? undefined,
          });
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Revision: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Revision pipeline error', { task: task.headline, error: e });
          logToSheet('Revision', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      for (const task of tasks.filter((t) => t.status === 'Перегенерировать картинку')) {
        try {
          await regenerateImagePipeline(task, settings);
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Regenerate image: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Regenerate image pipeline error', { task: task.headline, error: e });
          logToSheet('RegenerateImage', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      const approved = tasks.filter((t) => t.status === 'Одобрено на публикацию');
      const limit = Math.max(0, settings.maxArticlesPerDay - publishedToday);
      const intervalMs = settings.publishIntervalMin * 60_000;
      const canPublishNext = limit > 0 && (lastPublishedAt === 0 || Date.now() - lastPublishedAt >= intervalMs);
      const toPublish = canPublishNext ? approved.slice(0, 1) : [];
      for (const task of toPublish) {
        try {
          await publishingPipeline(task);
          publishedToday += 1;
          lastPublishedAt = Date.now();
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Publish: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Publishing pipeline error', { task: task.headline, error: e });
          logToSheet('Publish', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
        }
      }

      if (
        dailySummarySentDate !== today &&
        isAfterSummaryTime(settings.dailySummaryTime)
      ) {
        try {
          await sendDailySummary(dailyErrors.length ? dailyErrors : undefined);
          dailySummarySentDate = today;
          dailyErrors.length = 0;
        } catch (e) {
          const { message: msg } = serializeError(e);
          logInfo('Daily summary error', { error: e });
          logToSheet('DailySummary', 'error', msg.slice(0, 500)).catch(() => {});
        }
      }

      await sleep(settings.pollInterval);
    } catch (e) {
      const { message: msg } = serializeError(e);
      logInfo('Main loop error', { error: e });
      logToSheet('MainLoop', 'error', msg.slice(0, 500)).catch(() => {});
      await sleep(60_000);
    }
  }
  logInfo('Main loop stopped');
}
