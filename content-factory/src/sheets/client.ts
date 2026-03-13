/**
 * Инициализация Google Sheets API (Service Account).
 */
import { google } from 'googleapis';
import { config } from '../config';

const auth = new google.auth.GoogleAuth({
  keyFile: config.google.serviceAccountKey,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export const sheets = google.sheets({ version: 'v4', auth });
export const spreadsheetId = config.google.spreadsheetId;

const TASKS_SHEET_NAME = 'Задания';

/** Числовой ID листа «Задания» (нужен для insertDimension). Кэшируется только для дефолтной таблицы. */
let cachedSheetId: number | null = null;

/**
 * Получить числовой ID листа «Задания» в таблице.
 * @param spreadsheetIdOverride — ID таблицы клиента; при отсутствии используется config (одна таблица).
 */
export async function getSheetId(spreadsheetIdOverride?: string): Promise<number> {
  const sid = spreadsheetIdOverride ?? spreadsheetId;
  if (sid === spreadsheetId && cachedSheetId != null) return cachedSheetId;
  const res = await sheets.spreadsheets.get({ spreadsheetId: sid });
  const sheet = res.data.sheets?.find(
    (s) => s.properties?.title === TASKS_SHEET_NAME
  );
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Лист "${TASKS_SHEET_NAME}" не найден в таблице`);
  }
  if (sid === spreadsheetId) cachedSheetId = sheet.properties.sheetId;
  return sheet.properties.sheetId;
}
