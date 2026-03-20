/**
 * Копирование эталонной Google-таблицы для нового клиента.
 * Drive API: copy файла, выдача прав сервисному аккаунту.
 * Sheets API: скрытие технических колонок (P = Символы, Q = Запланировано).
 *
 * Требования к шаблону: листы «Задания», «Настройки», «Статистика», «Лог»; структура колонок как в writer/tasks.
 * Копирование: по умолчанию от SA — владелец копии = SA, квоты почти нет → часто 403 storageQuotaExceeded.
 * Решения: (1) GOOGLE_DRIVE_COPY_OAUTH_* — копия от пользователя с квотой; (2) папка на Shared drive + SA как участник.
 * Сервисному аккаунту после копии выдаётся writer на новый файл.
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

/** Три переменные OAuth заданы — копируем шаблон от имени пользователя (квота на его Drive / Shared drive). */
function hasDriveCopyOAuth(): boolean {
  const id = config.google.driveCopyOAuthClientId?.trim();
  const secret = config.google.driveCopyOAuthClientSecret?.trim();
  const rt = config.google.driveCopyOAuthRefreshToken?.trim();
  return Boolean(id && secret && rt);
}

async function driveCopyAsUserOAuth(
  templateSpreadsheetId: string,
  requestBody: { name: string; parents?: string[] }
): Promise<string> {
  const oauth2 = new google.auth.OAuth2(
    config.google.driveCopyOAuthClientId!.trim(),
    config.google.driveCopyOAuthClientSecret!.trim()
  );
  oauth2.setCredentials({
    refresh_token: config.google.driveCopyOAuthRefreshToken!.trim(),
  });
  logInfo('Drive template copy: using user OAuth (not service account)');
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  return executeDriveFileCopy(drive, templateSpreadsheetId, requestBody);
}

async function driveCopyAsServiceAccount(
  templateSpreadsheetId: string,
  requestBody: { name: string; parents?: string[] }
): Promise<string> {
  const googleAuth = new google.auth.GoogleAuth({
    keyFile: config.google.serviceAccountKey,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
  const auth = await googleAuth.getClient();
  // JWT от SA принимается Drive API; тип getClient() шире, чем ожидает overload google.drive().
  const drive = google.drive({ version: 'v3', auth: auth as Parameters<typeof google.drive>[0]['auth'] });
  return executeDriveFileCopy(drive, templateSpreadsheetId, requestBody);
}

async function executeDriveFileCopy(
  drive: ReturnType<typeof google.drive>,
  templateSpreadsheetId: string,
  requestBody: { name: string; parents?: string[] }
): Promise<string> {
  const res = await drive.files.copy({
    fileId: templateSpreadsheetId,
    requestBody,
    supportsAllDrives: true,
  });
  const newId = res.data.id;
  if (!newId) {
    throw new Error('Drive copy did not return file id');
  }
  logInfo('Template copied', { templateId: templateSpreadsheetId, newId, newTitle: requestBody.name });
  return newId;
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
  const requestBody: { name: string; parents?: string[] } = { name: newTitle };
  if (options?.parents?.length) requestBody.parents = options.parents;

  if (hasDriveCopyOAuth()) {
    return driveCopyAsUserOAuth(templateSpreadsheetId, requestBody);
  }
  return driveCopyAsServiceAccount(templateSpreadsheetId, requestBody);
}

/**
 * Выдать доступ на запись (writer) указанному email к файлу/таблице.
 * Для людей (не сервисного аккаунта) включаем sendNotificationEmail: иначе Drive API 400 для адресов
 * без привязанного Google-аккаунта («must check Notify people»).
 * Для SA уведомления не нужны и остаются выключенными.
 */
export async function shareWithEmail(
  fileId: string,
  email: string,
  role: 'writer' | 'reader' = 'writer'
): Promise<void> {
  const trimmed = email.trim();
  const saEmail = getServiceAccountEmail().toLowerCase();
  const sendNotificationEmail = trimmed.toLowerCase() !== saEmail;

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
      emailAddress: trimmed,
    },
    sendNotificationEmail,
    supportsAllDrives: true,
  });
  logInfo('Shared file with email', { fileId, email: trimmed, role, sendNotificationEmail });
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
 * @param options.copyParentFolderId — ID папки Drive для копии (иначе из config.google.clientTablesFolderId; без папцы копия идёт в диск SA → часто quota exceeded).
 */
export async function createClientTable(
  templateSpreadsheetId: string,
  clientName: string,
  options?: { shareWithEmail?: string; hideTechnicalColumns?: boolean; copyParentFolderId?: string }
): Promise<CreateClientTableResult> {
  const parentFromOpts = options?.copyParentFolderId?.trim();
  const parentFromConfig = config.google.clientTablesFolderId?.trim();
  const parentFolderId = parentFromOpts || parentFromConfig;
  const newId = await copySpreadsheetFromTemplate(
    templateSpreadsheetId,
    clientName,
    parentFolderId ? { parents: [parentFolderId] } : undefined
  );
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
