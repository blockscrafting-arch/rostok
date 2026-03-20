/**
 * Загрузка task и settings в воркере по payload (rowIndex, spreadsheetId, clientId).
 * Мульти-клиент: из БД (getClientWithSettings + mergeSettings). Одна таблица: readSettings из листа.
 * Короткоживущий кэш (settings 60 с, tasks 5 с) снижает нагрузку на Google Sheets API при росте воркеров.
 */
import { PromiseCache } from '../utils/cache';
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { getAdminSettings } from '../db/repositories/adminSettings';
import { getClientWithSettings } from '../db/repositories/clients';
import { mergeSettings } from '../settings/mergeSettings';
import { logWarn } from '../utils/logger';
import type { Settings } from '../types';
import type { BaseJobPayload } from '../queue/types';
import type { LoadedJobData } from '../queue/types';

const SETTINGS_TTL_MS = 60_000;
const TASKS_TTL_MS = 5_000;

const settingsCache = new PromiseCache<Settings>(SETTINGS_TTL_MS);
const tasksCache = new PromiseCache<Awaited<ReturnType<typeof readTasks>>>(TASKS_TTL_MS);

/** После синка листа «Настройки» → БД воркеры подхватят свежий mergeSettings. */
export function invalidateClientSettingsCache(clientId: string): void {
  if (clientId && clientId !== 'default') {
    settingsCache.invalidate(`client:${clientId}`);
  }
}

export async function loadTaskAndSettings(payload: BaseJobPayload): Promise<LoadedJobData> {
  let settings: Settings;
  /** Одна таблица из .env: в очереди clientId = "default", в БД строки клиента нет — только лист «Настройки». */
  const legacySingleTable =
    !payload.clientId?.trim() || payload.clientId.trim() === 'default';

  if (!legacySingleTable) {
    settings = await settingsCache.getOrFetch(`client:${payload.clientId}`, async () => {
      const client = await getClientWithSettings(payload.clientId!);
      if (!client) {
        logWarn('Client not in DB, using sheet settings for job', {
          clientId: payload.clientId,
          spreadsheetId: payload.spreadsheetId,
        });
        return readSettings({ spreadsheetId: payload.spreadsheetId });
      }
      const admin = await getAdminSettings();
      if (!admin) throw new Error('Admin settings not found');
      return mergeSettings(admin, client, client.settings);
    });
  } else {
    settings = await settingsCache.getOrFetch(`sheet:${payload.spreadsheetId}`, () =>
      readSettings({ spreadsheetId: payload.spreadsheetId })
    );
  }
  const tasks = await tasksCache.getOrFetch(payload.spreadsheetId, () =>
    readTasks({ spreadsheetId: payload.spreadsheetId })
  );
  const task = tasks.find((t) => t.rowIndex === payload.rowIndex);
  if (!task) throw new Error(`Task row ${payload.rowIndex} not found`);
  return { task, settings };
}
