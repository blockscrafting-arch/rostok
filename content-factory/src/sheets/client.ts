/**
 * Инициализация Google Sheets API (Service Account).
 */
import { google } from 'googleapis';
import { config } from '../config';
import { logWarn } from '../utils/logger';

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
  const normalizeSheetName = (s: string) => s.trim().normalize('NFC');
  const sheet = res.data.sheets?.find(
    (s) => normalizeSheetName(s.properties?.title ?? '') === normalizeSheetName(TASKS_SHEET_NAME)
  );
  if (!sheet?.properties?.sheetId) {
    const available = res.data.sheets?.map((s) => ({
      title: s.properties?.title ?? '?',
      firstCharCode: s.properties?.title?.codePointAt(0),
    })) ?? [];
    logWarn('getSheetId: sheet not found', {
      spreadsheetId: sid,
      target: TASKS_SHEET_NAME,
      targetFirstCharCode: TASKS_SHEET_NAME.codePointAt(0),
      availableSheets: available,
    });
    throw new Error(`Лист "${TASKS_SHEET_NAME}" не найден в таблице`);
  }
  if (sid === spreadsheetId) cachedSheetId = sheet.properties.sheetId;
  return sheet.properties.sheetId;
}
