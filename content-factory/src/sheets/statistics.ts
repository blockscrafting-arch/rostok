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
 * Добавить строку в лист «Статистика».
 * Предполагаем колонки: Заголовок | Токены вход | Токены выход | Модель | Стоимость текста (₽) | Стоимость картинки (₽) | Итого (₽) | Дата
 */
export async function appendStatistics(row: StatRow): Promise<void> {
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${SHEET_NAME}'!A:H`,
    valueInputOption: 'USER_ENTERED',
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
