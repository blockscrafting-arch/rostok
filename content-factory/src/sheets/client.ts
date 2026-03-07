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

/** Числовой ID листа «Задания» (нужен для insertDimension). Кэшируется. */
let cachedSheetId: number | null = null;

export async function getSheetId(): Promise<number> {
  if (cachedSheetId != null) return cachedSheetId;
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = res.data.sheets?.find(
    (s) => s.properties?.title === TASKS_SHEET_NAME
  );
  if (!sheet?.properties?.sheetId) {
    throw new Error(`Лист "${TASKS_SHEET_NAME}" не найден в таблице`);
  }
  cachedSheetId = sheet.properties.sheetId;
  return cachedSheetId;
}
