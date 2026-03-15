/**
 * Главный цикл: polling Google Sheets, постановка задач в очереди BullMQ.
 * Воркеры обрабатывают пайплайны (семантика, текст, картинка, публикация).
 * Учёт maxArticlesPerDay, вызов ежедневной сводки по dailySummaryTime.
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { sendDailySummary } from '../telegram/notifier';
import { sleep } from '../utils/sleep';
import { logInfo, logToSheet, serializeError, getApiErrorResponsePreview } from '../utils/logger';
import { getAdminSettings } from '../db/repositories/adminSettings';
import { getActiveClientsWithSettings } from '../db/repositories/clients';
import { mergeSettings } from '../settings/mergeSettings';
import {
  semanticsQueue,
  generationQueue,
  imageQueue,
  regenerateImageQueue,
  publishQueue,
} from '../queue';
import { config } from '../config';
import { getPublishState, setPublishState, type PublishState } from '../redis/publishState';
import type { Settings } from '../types';
import type { QueueContextPayload } from '../queue/types';

/** Дата в локальной таймзоне (при TZ=Europe/Moscow — по Москве) для сброса лимита статей в день. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Проверка: наступило ли время сводки (например "21:00"). Невалидная строка — считаем, что не наступило. */
function isAfterSummaryTime(summaryTime: string): boolean {
  const targetM = parseTimeHHMM(summaryTime);
  if (targetM === null) return false;
  const nowM = minutesSinceMidnight(new Date());
  return nowM >= targetM;
}

/** Длина окна (минуты) для генерации картинок по расписанию: только в этот интервал после generationTime. */
const IMAGE_GENERATION_WINDOW_MINUTES = 60;

/**
 * Проверка: текущее время в окне для генерации картинок по расписанию.
 * Например при generationTime "05:00" и окне 60 мин — только с 5:00 до 6:00, не в 14:30.
 * Невалидное время (например "25:00") — окно не активно (false).
 */
function isWithinImageGenerationWindow(timeStr: string, windowMinutes: number): boolean {
  const startM = parseTimeHHMM(timeStr);
  if (startM === null) return false;
  const nowM = minutesSinceMidnight(new Date());
  const endM = startM + windowMinutes;
  if (endM <= 24 * 60) {
    return nowM >= startM && nowM < endM;
  }
  return nowM >= startM || nowM < endM % (24 * 60);
}

/** Текущее время в минутах с полуночи (локальная таймзона, ожидается TZ=Europe/Moscow). */
function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Валидация времени «ЧЧ:ММ» (0–23, 0–59). Возвращает минуты с полуночи или null при ошибке. */
function parseTimeHHMM(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Проверка: текущее время входит в окно [start, end]. Пустые или невалидные — ограничения нет. */
function isWithinPublishWindow(start: string, end: string): boolean {
  const startM = parseTimeHHMM(start);
  const endM = parseTimeHHMM(end);
  if (startM === null && endM === null) return true;
  const nowM = minutesSinceMidnight(new Date());
  if (startM !== null && nowM < startM) return false;
  if (endM !== null && nowM > endM) return false;
  return true;
}

/**
 * Проверка: наступило ли запланированное время публикации.
 * scheduledAt: "ДД.ММ.ГГГГ ЧЧ:ММ" или "ДД.ММ.ГГГГ ЧЧ:ММ:СС", или "ЧЧ:ММ", или "ЧЧ:ММ:СС". Пусто — ограничения нет (true).
 * Поддерживается формат таблицы с секундами (например 12.03.2026 8:00:00).
 */
function isScheduledTimeReached(scheduledAt: string | null): boolean {
  const raw = (scheduledAt ?? '').trim();
  if (!raw) return true;
  const now = new Date();
  let target: Date;
  const fullMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (fullMatch) {
    const [, day, month, year, hour, min, sec] = fullMatch.map((x) => (x != null ? parseInt(x, 10) : 0));
    target = new Date(year, month - 1, day, hour, min, sec || 0, 0);
  } else {
    const timeMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const [, hour, min, sec] = timeMatch.map((x) => (x != null ? parseInt(x, 10) : 0));
      target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, min, sec || 0, 0);
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

const PUBLISH_SKIPPED_LOG_THROTTLE_MS = 5 * 60 * 1000; // 5 минут

/** Контекст для постановки задач в очереди (clientId и API key для воркеров). */
interface QueueContext {
  clientId: string;
  openrouterApiKey: string;
}

async function runPipelinesForClient(
  settings: Settings,
  tasks: Awaited<ReturnType<typeof readTasks>>,
  context: { sheetContext: { spreadsheetId: string }; telegramChannelId?: string } | undefined,
  queueContext: QueueContext,
  state: PublishState,
  dailyErrors: string[],
  today: string
): Promise<PublishState> {
  let {
    publishedToday,
    lastPublishedAt,
    lastDateKey,
    lastPublishSkippedLogAt,
    lastPublishSkippedReason,
  } = state;
  if (today !== lastDateKey) {
    publishedToday = 0;
    lastPublishedAt = 0;
    lastDateKey = today;
  }

  const spreadsheetId = context?.sheetContext?.spreadsheetId ?? '';
  const ctxPayload: QueueContextPayload = {
    clientId: queueContext.clientId,
    spreadsheetId,
    openrouterApiKey: queueContext.openrouterApiKey,
    telegramChannelId: context?.telegramChannelId,
  };

  for (const task of tasks.filter((t) => t.status === 'Новое').reverse()) {
    await semanticsQueue.add('semantics', { ...ctxPayload, rowIndex: task.rowIndex });
  }

  for (const task of tasks.filter((t) => t.status === 'Согласован заголовок')) {
    await generationQueue.add('generate-text', { ...ctxPayload, rowIndex: task.rowIndex, options: { isRevision: false } });
  }

  const imagePending = tasks.filter((t) => t.status === 'Текст готов, ждём картинку');
  const isScheduled = settings.imageGenerationMode === 'scheduled';
  const canRunImageGeneration =
    !isScheduled ||
    isWithinImageGenerationWindow(settings.generationTime, IMAGE_GENERATION_WINDOW_MINUTES);
  if (imagePending.length > 0 && !canRunImageGeneration) {
    logInfo('Image generation skipped (scheduled, outside time window)', {
      mode: 'scheduled',
      generationTime: settings.generationTime,
      pendingCount: imagePending.length,
    });
  }
  for (const task of imagePending) {
    if (!canRunImageGeneration) break;
    await imageQueue.add('generate-image', { ...ctxPayload, rowIndex: task.rowIndex });
  }

  for (const task of tasks.filter((t) => t.status === 'На доработку')) {
    await generationQueue.add('revision', {
      ...ctxPayload,
      rowIndex: task.rowIndex,
      options: { isRevision: true, editorComment: task.comment ?? undefined },
    });
  }

  for (const task of tasks.filter((t) => t.status === 'Перегенерировать текст')) {
    await generationQueue.add('regenerate-text', {
      ...ctxPayload,
      rowIndex: task.rowIndex,
      options: { isRevision: true, editorComment: task.comment ?? undefined, keepImage: true },
    });
  }

  for (const task of tasks.filter((t) => t.status === 'Перегенерировать картинку')) {
    await regenerateImageQueue.add('regenerate-image', { ...ctxPayload, rowIndex: task.rowIndex });
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
  if (readyBySchedule.length > 0 && toPublish.length === 0) {
    const reason =
      limit === 0 ? 'limit_reached' : !withinWindow ? 'outside_window' : 'interval_wait';
    const now = Date.now();
    const throttleOk =
      now - lastPublishSkippedLogAt >= PUBLISH_SKIPPED_LOG_THROTTLE_MS ||
      lastPublishSkippedReason !== reason;
    if (throttleOk) {
      const nextPublishInMin =
        reason === 'interval_wait' && lastPublishedAt > 0
          ? Math.ceil((intervalMs - (now - lastPublishedAt)) / 60_000)
          : undefined;
      logInfo('Publish skipped', {
        reason,
        readyCount: readyBySchedule.length,
        limit,
        withinWindow,
        ...(nextPublishInMin != null && nextPublishInMin > 0 ? { nextPublishInMin } : {}),
      });
      lastPublishSkippedLogAt = now;
      lastPublishSkippedReason = reason;
    }
  }
  for (const task of toPublish) {
    await publishQueue.add('publish', { ...ctxPayload, rowIndex: task.rowIndex });
    publishedToday += 1;
    lastPublishedAt = Date.now();
    lastPublishSkippedReason = '';
    lastPublishSkippedLogAt = 0;
  }

  return {
    publishedToday,
    lastPublishedAt,
    lastDateKey,
    lastPublishSkippedLogAt,
    lastPublishSkippedReason,
  };
}

export async function mainLoop(): Promise<void> {
  let dailySummarySentDate = '';
  const dailyErrors: string[] = [];

  while (isRunning) {
    try {
      const today = todayKey();
      let pollIntervalMs = 60_000;
      let summaryTime = '21:00';

      const admin = await getAdminSettings().catch(() => null);
      const clients = admin ? await getActiveClientsWithSettings().catch(() => []) : [];

      if (admin && clients.length > 0) {
        // Мульти-клиент: цикл по клиентам с spreadsheetId
        for (const client of clients) {
          if (!client.spreadsheetId?.trim()) {
            logInfo('Client skipped: no spreadsheetId', { clientId: client.id, clientName: client.name });
            continue;
          }
          try {
            const settings = mergeSettings(admin, client, client.settings);
            pollIntervalMs = settings.pollInterval;
            summaryTime = settings.dailySummaryTime;
            const sheetContext = { spreadsheetId: client.spreadsheetId };
            const context = {
              sheetContext,
              telegramChannelId: client.telegramChannelId ?? undefined,
            };
            const queueContext: QueueContext = {
              clientId: client.id,
              openrouterApiKey: client.openrouterApiKey,
            };
            const tasks = await readTasks({ spreadsheetId: client.spreadsheetId });
            const state = await getPublishState(client.id);
            const nextState = await runPipelinesForClient(
              settings,
              tasks,
              context,
              queueContext,
              state,
              dailyErrors,
              today
            );
            await setPublishState(client.id, nextState);
          } catch (e) {
            const { message: msg } = serializeError(e);
            logInfo('Client loop error', { clientId: client.id, clientName: client.name, errorMessage: serializeError(e).message, responsePreview: getApiErrorResponsePreview(e) });
            dailyErrors.push(`Client ${client.name}: ${msg}`);
          }
        }
      } else {
        // Одна таблица из config (обратная совместимость)
        const settings = await readSettings();
        const tasks = await readTasks();
        pollIntervalMs = settings.pollInterval;
        summaryTime = settings.dailySummaryTime;
        const context = { sheetContext: { spreadsheetId: config.google.spreadsheetId } };
        const queueContext: QueueContext = {
          clientId: '',
          openrouterApiKey: config.openrouter.apiKey,
        };
        const state = await getPublishState('');
        const nextState = await runPipelinesForClient(
          settings,
          tasks,
          context,
          queueContext,
          state,
          dailyErrors,
          today
        );
        await setPublishState('', nextState);
      }

      if (dailySummarySentDate !== today && isAfterSummaryTime(summaryTime)) {
        try {
          const summaryClients = admin && clients.length > 0
            ? clients.filter((c) => c.spreadsheetId?.trim()).map((c) => ({ id: c.id, name: c.name, spreadsheetId: c.spreadsheetId! }))
            : undefined;
          await sendDailySummary(
            dailyErrors.length ? dailyErrors : undefined,
            summaryClients ? { clients: summaryClients } : undefined
          );
          dailySummarySentDate = today;
          dailyErrors.length = 0;
        } catch (e) {
          const { message: msg } = serializeError(e);
          logInfo('Daily summary error', { errorMessage: serializeError(e).message });
          logToSheet('DailySummary', 'error', msg.slice(0, 500)).catch(() => {});
        }
      }

      await sleep(pollIntervalMs);
    } catch (e) {
      const { message: msg } = serializeError(e);
      logInfo('Main loop error', { errorMessage: serializeError(e).message });
      logToSheet('MainLoop', 'error', msg.slice(0, 500)).catch(() => {});
      await sleep(60_000);
    }
  }
  logInfo('Main loop stopped');
}
