/**
 * Загрузка task и settings в воркере по payload (rowIndex, spreadsheetId, clientId).
 * Мульти-клиент: из БД (getClientWithSettings + mergeSettings). Одна таблица: readSettings из листа.
 */
import { readTasks } from '../sheets/tasks';
import { readSettings } from '../sheets/settings';
import { getAdminSettings } from '../db/repositories/adminSettings';
import { getClientWithSettings } from '../db/repositories/clients';
import { mergeSettings } from '../settings/mergeSettings';
import type { BaseJobPayload } from '../queue/types';
import type { LoadedJobData } from '../queue/types';

export async function loadTaskAndSettings(payload: BaseJobPayload): Promise<LoadedJobData> {
  let settings;
  if (payload.clientId) {
    const client = await getClientWithSettings(payload.clientId);
    if (!client) throw new Error(`Client not found: ${payload.clientId}`);
    const admin = await getAdminSettings();
    if (!admin) throw new Error('Admin settings not found');
    settings = mergeSettings(admin, client, client.settings);
  } else {
    settings = await readSettings({ spreadsheetId: payload.spreadsheetId });
  }
  const tasks = await readTasks({ spreadsheetId: payload.spreadsheetId });
  const task = tasks.find((t) => t.rowIndex === payload.rowIndex);
  if (!task) throw new Error(`Task row ${payload.rowIndex} not found`);
  return { task, settings };
}
