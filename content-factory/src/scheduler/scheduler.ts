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

/** Дата в локальной таймзоне (при TZ=Europe/Moscow — по Москве) для сброса лимита статей в день. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

/** Текущее время в минутах с полуночи (локальная таймзона, ожидается TZ=Europe/Moscow). */
function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Проверка: текущее время входит в окно [start, end]. Пустые start/end — ограничения нет. */
function isWithinPublishWindow(start: string, end: string): boolean {
  const s = start.trim();
  const e = end.trim();
  if (!s && !e) return true;
  const nowM = minutesSinceMidnight(new Date());
  if (s) {
    const [sh, sm] = s.split(':').map((x) => parseInt(x, 10) || 0);
    const startM = sh * 60 + sm;
    if (nowM < startM) return false;
  }
  if (e) {
    const [eh, em] = e.split(':').map((x) => parseInt(x, 10) || 0);
    const endM = eh * 60 + em;
    if (nowM > endM) return false;
  }
  return true;
}

/**
 * Проверка: наступило ли запланированное время публикации.
 * scheduledAt: "ДД.ММ.ГГГГ ЧЧ:ММ" или "ЧЧ:ММ". Пусто — ограничения нет (true).
 */
function isScheduledTimeReached(scheduledAt: string | null): boolean {
  const raw = (scheduledAt ?? '').trim();
  if (!raw) return true;
  const now = new Date();
  let target: Date;
  const fullMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (fullMatch) {
    const [, day, month, year, hour, min] = fullMatch.map((x) => parseInt(x, 10));
    target = new Date(year, month - 1, day, hour, min, 0, 0);
  } else {
    const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const [, hour, min] = timeMatch.map((x) => parseInt(x, 10));
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, 0, 0);
    } else {
      return true;
    }
  }
  return now >= target;
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

      const imagePending = tasks.filter((t) => t.status === 'Текст готов, ждём картинку');
      const isScheduled = settings.imageGenerationMode === 'scheduled';
      const canRunImageGeneration = !isScheduled || isAfterTime(settings.generationTime);
      if (imagePending.length > 0 && !canRunImageGeneration) {
        logInfo('Image generation skipped (scheduled, before time)', {
          mode: 'scheduled',
          generationTime: settings.generationTime,
          pendingCount: imagePending.length,
        });
      }
      for (const task of imagePending) {
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

      for (const task of tasks.filter((t) => t.status === 'Перегенерировать текст')) {
        try {
          await generationPipeline(task, settings, {
            isRevision: true,
            editorComment: task.comment ?? undefined,
            keepImage: true,
          });
        } catch (e) {
          const { message: msg } = serializeError(e);
          dailyErrors.push(`Regenerate text: ${task.headline ?? task.keyword} — ${msg}`);
          logInfo('Regenerate text pipeline error', { task: task.headline, error: e });
          logToSheet('RegenerateText', 'error', `${task.headline ?? task.keyword}: ${msg}`.slice(0, 500)).catch(() => {});
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
      const readyBySchedule = approved.filter((t) => isScheduledTimeReached(t.scheduledAt));
      const withinWindow = isWithinPublishWindow(settings.publishWindowStart, settings.publishWindowEnd);
      const limit = Math.max(0, settings.maxArticlesPerDay - publishedToday);
      const intervalMs = settings.publishIntervalMin * 60_000;
      const canPublishNext =
        limit > 0 &&
        withinWindow &&
        (lastPublishedAt === 0 || Date.now() - lastPublishedAt >= intervalMs);
      const toPublish = canPublishNext ? readyBySchedule.slice(0, 1) : [];
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
