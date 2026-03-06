/**
 * Запись в лист «Статистика»: токены, модель, стоимость текста/картинки, итого, дата.
 */
import { sheets, spreadsheetId } from './client';

const SHEET_NAME = 'Статистика';

export interface StatRow {
  headline: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  costTextRub: number;
  costImageRub: number;
  costTotalRub: number;
  date: string;
}

/**
 * Добавить строку в лист «Статистика». RAW — защита от formula injection в заголовке.
 * Колонки: Заголовок | Токены вход | Токены выход | Модель | Стоимость текста (₽) | Стоимость картинки (₽) | Итого (₽) | Дата
 */
export async function appendStatistics(row: StatRow): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${SHEET_NAME}'!A:H`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [
        [
          row.headline,
          row.inputTokens,
          row.outputTokens,
          row.model,
          row.costTextRub,
          row.costImageRub,
          row.costTotalRub,
          row.date,
        ],
      ],
    },
  });
}

const DATE_COL_INDEX = 7; // H = 8-я колонка, 0-based = 7

/**
 * Статистика за сегодня: число строк и сумма по колонке «Итого (₽)».
 */
export async function getTodayStats(): Promise<{ count: number; totalCostRub: number }> {
  const today = new Date().toISOString().slice(0, 10);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_NAME}'!A:H`,
  });
  const rows = (res.data.values ?? []) as (string | number)[][];
  let count = 0;
  let totalCostRub = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const date = String(row[DATE_COL_INDEX] ?? '').trim();
    if (date !== today) continue;
    count += 1;
    const cost = Number(row[6]);
    if (!Number.isNaN(cost)) totalCostRub += cost;
  }
  return { count, totalCostRub };
}
