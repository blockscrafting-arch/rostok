/**
 * Запись в лист «Статистика»: токены, модель, стоимость текста/картинки, итого, дата.
 * Статистика за период: по одной таблице (spreadsheetId) или по config (одна таблица).
 */
import { sheets, spreadsheetId } from './client';
import type { SheetContext } from './writer';

const SHEET_NAME = 'Статистика';

export interface StatRow {
  headline: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costTextUsd: number;
  costImageUsd: number;
  costTotalUsd: number;
  date: string;
}

/**
 * Добавить строку в лист «Статистика». RAW — защита от formula injection в заголовке.
 * Колонки: Заголовок | Токены вход | Токены выход | Модель | Стоимость текста ($) | Стоимость картинки ($) | Итого ($) | Дата
 * @param ctx — таблица клиента; при отсутствии используется config.
 */
export async function appendStatistics(row: StatRow, ctx?: SheetContext): Promise<void> {
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  await sheets.spreadsheets.values.append({
    spreadsheetId: sid,
    range: `'${SHEET_NAME}'!A:H`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          row.headline,
          row.inputTokens,
          row.outputTokens,
          row.model,
          row.costTextUsd,
          row.costImageUsd,
          row.costTotalUsd,
          row.date,
        ],
      ],
    },
  });
}

const DATE_COL_INDEX = 7; // H = 8-я колонка, 0-based = 7
const COST_COL_INDEX = 6; // G = Итого ($)

export interface PeriodStats {
  count: number;
  totalCostUsd: number;
  avgCostUsd: number;
}

async function readAllRows(overrides?: { spreadsheetId?: string }): Promise<(string | number)[][]> {
  const sid = overrides?.spreadsheetId ?? spreadsheetId;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sid,
    range: `'${SHEET_NAME}'!A:H`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return (res.data.values ?? []) as (string | number)[][];
}

/** Привести значение стоимости к числу (поддержка запятой как десятичного разделителя). */
function parseCost(value: string | number | undefined): number {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isNaN(value) ? NaN : value;
  const normalized = String(value).trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isNaN(n) ? NaN : n;
}

/** Серийный номер даты Google Sheets (0 = 1899-12-30) → YYYY-MM-DD. */
function dateCellToYYYYMMDD(value: string | number | undefined): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const days = Math.floor(n);
  const d = new Date((days - 25569) * 86400 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Статистика за период [fromDate, toDate] (даты в формате YYYY-MM-DD включительно).
 * @param options.spreadsheetId — таблица клиента; при отсутствии используется config (одна таблица).
 */
export async function getStatsForPeriod(
  fromDate: string,
  toDate: string,
  options?: { spreadsheetId?: string }
): Promise<PeriodStats> {
  const rows = await readAllRows(options);
  let count = 0;
  let totalCostUsd = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = dateCellToYYYYMMDD(row[DATE_COL_INDEX]);
    if (!date || date < fromDate || date > toDate) continue;
    count += 1;
    const cost = parseCost(row[COST_COL_INDEX]);
    if (!Number.isNaN(cost)) totalCostUsd += cost;
  }
  const avgCostUsd = count > 0 ? totalCostUsd / count : 0;
  return { count, totalCostUsd, avgCostUsd };
}

/**
 * Статистика за сегодня.
 * @param options.spreadsheetId — таблица клиента; при отсутствии — config.
 */
export async function getTodayStats(options?: { spreadsheetId?: string }): Promise<PeriodStats> {
  const today = new Date().toISOString().slice(0, 10);
  return getStatsForPeriod(today, today, options);
}

/**
 * Статистика за последние 7 дней (включая сегодня).
 */
export async function getWeekStats(options?: { spreadsheetId?: string }): Promise<PeriodStats> {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const weekAgoStr = weekAgo.toISOString().slice(0, 10);
  return getStatsForPeriod(weekAgoStr, today, options);
}

/**
 * Статистика за текущий календарный месяц.
 */
export async function getMonthStats(options?: { spreadsheetId?: string }): Promise<PeriodStats> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return getStatsForPeriod(fromDate, toDate, options);
}
