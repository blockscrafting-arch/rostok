/**
 * Логирование: консоль + при необходимости запись в лист «Лог».
 */
import { google } from 'googleapis';
import { config } from '../config';

const LOG_SHEET_NAME = 'Лог';

function formatMsg(level: string, message: string, meta?: unknown): string {
  const ts = new Date().toISOString();
  const extra = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts}] ${level} ${message}${extra}`;
}

export function logInfo(message: string, meta?: unknown): void {
  console.log(formatMsg('INFO', message, meta));
}

export function logWarn(message: string, meta?: unknown): void {
  console.warn(formatMsg('WARN', message, meta));
}

export function logError(message: string, error?: unknown): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  console.error(formatMsg('ERROR', message, errMsg));
}

/**
 * Записать строку в лист «Лог» (время, действие, результат, ошибка).
 * Не бросает исключение при сбое записи.
 */
export async function logToSheet(
  action: string,
  result: 'ok' | 'error',
  errorMessage?: string
): Promise<void> {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const s = google.sheets({ version: 'v4', auth });
    await s.spreadsheets.values.append({
      spreadsheetId: config.google.spreadsheetId,
      range: `'${LOG_SHEET_NAME}'!A:D`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [[new Date().toISOString(), action, result, errorMessage ?? '']],
      },
    });
  } catch (e) {
    console.error('Failed to write to Log sheet:', e);
  }
}
