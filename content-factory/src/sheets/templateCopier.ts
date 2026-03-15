/**
 * Копирование эталонной Google-таблицы для нового клиента.
 * Drive API: copy файла, выдача прав сервисному аккаунту.
 * Sheets API: скрытие технических колонок (P = Символы, Q = Запланировано).
 *
 * Требования к шаблону: листы «Задания», «Настройки», «Статистика», «Лог»; структура колонок как в writer/tasks.
 * Сервисному аккаунту нужен доступ к шаблону (как минимум «Просмотр») для копирования.
 */
import * as fs from 'fs';
import * as path from 'path';
import { google } from 'googleapis';
import { config } from '../config';
import { sheets } from './client';
import { logInfo, logWarn } from '../utils/logger';

const TASKS_SHEET_NAME = 'Задания';
/** Колонки P (16) и Q (17) в 0-based — технические, скрываем по умолчанию. */
const TECHNICAL_COLUMN_START = 15; // P
const TECHNICAL_COLUMN_END = 17;   // Q (endIndex невключительно)

/** Прочитать client_email из ключа сервисного аккаунта (JSON). */
export function getServiceAccountEmail(): string {
  const keyPath = path.resolve(config.google.serviceAccountKey);
  const raw = fs.readFileSync(keyPath, 'utf-8');
  const json = JSON.parse(raw) as { client_email?: string };
  if (!json.client_email || typeof json.client_email !== 'string') {
    throw new Error('Service account key must contain client_email');
  }
  return json.client_email;
}

/**
 * Копировать таблицу по ID (Drive: файл типа spreadsheet).
 * @param templateSpreadsheetId — ID эталонной таблицы.
 * @param newTitle — название копии.
 * @param parents — опционально ID папки в Drive для размещения копии.
 * @returns ID новой таблицы (spreadsheetId).
 */
export async function copySpreadsheetFromTemplate(
  templateSpreadsheetId: string,
  newTitle: string,
  options?: { parents?: string[] }
): Promise<string> {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.google.serviceAccountKey,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  const drive = google.drive({ version: 'v3', auth });
  const requestBody: { name: string; parents?: string[] } = { name: newTitle };
  if (options?.parents?.length) requestBody.parents = options.parents;

  const res = await drive.files.copy({
    fileId: templateSpreadsheetId,
    requestBody,
    supportsAllDrives: true,
  });
  const newId = res.data.id;
  if (!newId) {
    throw new Error('Drive copy did not return file id');
  }
  logInfo('Template copied', { templateId: templateSpreadsheetId, newId, newTitle });
  return newId;
}

/**
 * Выдать доступ на запись (writer) указанному email к файлу/таблице.
 */
export async function shareWithEmail(
  fileId: string,
  email: string,
  role: 'writer' | 'reader' = 'writer'
): Promise<void> {
  const auth = new google.auth.GoogleAuth({
    keyFile: config.google.serviceAccountKey,
    scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/drive.file'],
  });
  const drive = google.drive({ version: 'v3', auth });
  await drive.permissions.create({
    fileId,
    requestBody: {
      type: 'user',
      role,
      emailAddress: email.trim(),
    },
    sendNotificationEmail: false,
  });
  logInfo('Shared file with email', { fileId, email: email.trim(), role });
}

/**
 * Скрыть технические колонки на листе «Задания» (P и Q).
 */
export async function hideTechnicalColumns(spreadsheetId: string): Promise<void> {
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets?.find((s) => s.properties?.title === TASKS_SHEET_NAME);
  if (!sheet?.properties?.sheetId) {
    logWarn('hideTechnicalColumns: sheet not found', { spreadsheetId, sheetName: TASKS_SHEET_NAME });
    return;
  }
  const sheetId = sheet.properties!.sheetId!;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'COLUMNS',
              startIndex: TECHNICAL_COLUMN_START,
              endIndex: TECHNICAL_COLUMN_END,
            },
            properties: { hiddenByUser: true },
            fields: 'hiddenByUser',
          },
        },
      ],
    },
  });
  logInfo('Technical columns hidden', { spreadsheetId, sheetName: TASKS_SHEET_NAME });
}

export interface CreateClientTableResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
}

/**
 * Создать таблицу клиента: копирование шаблона, выдача прав сервисному аккаунту, скрытие технических колонок.
 * @param templateSpreadsheetId — ID эталонной таблицы (или из config.google.templateSpreadsheetId).
 * @param clientName — название для копии (например «Контент — ООО Ромашка»).
 * @param options.shareWithEmail — если задан, дополнительно выдать доступ этому email (по умолчанию выдаётся только сервисному аккаунту).
 * @param options.hideTechnicalColumns — скрыть колонки P, Q (по умолчанию true).
 */
export async function createClientTable(
  templateSpreadsheetId: string,
  clientName: string,
  options?: { shareWithEmail?: string; hideTechnicalColumns?: boolean }
): Promise<CreateClientTableResult> {
  const newId = await copySpreadsheetFromTemplate(templateSpreadsheetId, clientName);
  const saEmail = getServiceAccountEmail();
  await shareWithEmail(newId, saEmail, 'writer');
  if (options?.shareWithEmail?.trim()) {
    await shareWithEmail(newId, options.shareWithEmail.trim(), 'writer');
  }
  const adminEmail = config.google.adminEmail?.trim();
  if (adminEmail) {
    await shareWithEmail(newId, adminEmail, 'writer');
  }
  if (options?.hideTechnicalColumns !== false) {
    await hideTechnicalColumns(newId);
  }
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${newId}/edit`;
  return { spreadsheetId: newId, spreadsheetUrl };
}
