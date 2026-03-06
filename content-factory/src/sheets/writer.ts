/**
 * Запись результатов в лист «Задания»: статус, заголовки, превью, источники, ссылки, стоимость.
 */
import { sheets, spreadsheetId } from './client';
import type { Task, TaskStatus } from '../types';
import type { ArticleResult } from '../types';

const SHEET_NAME = 'Задания';

/** Лимиты длины в ячейках (снижают риск ошибок интерфейса Google Таблиц). */
const MAX_CELL_PREVIEW = 32_000;
const MAX_CELL_SOURCES = 32_000;
const MAX_CELL_URL = 2_048;
const MAX_CELL_HEADLINES = 32_000;
const MAX_CELL_KEYWORDS = 32_000;
const MAX_ONE_HEADLINE = 500;

/** Колонки листа: A=1, B=2, ... G=7 Превью, H=8 Источники, I=9 Картинка, J=10 UTM, K=11 Пост, L=12 стоимость текста, M=13 картинки, N=14 итого, O=15 дата, P=16 статус. */
function colLetter(col1Based: number): string {
  let s = '';
  let n = col1Based - 1;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Обновить одну ячейку (sheetRow — номер строки в листе, 2-based). RAW — защита от formula injection. */
async function updateCell(sheetRow: number, col1Based: number, value: string | number): Promise<void> {
  const range = `'${SHEET_NAME}'!${colLetter(col1Based)}${sheetRow}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

/** Обновить статус строки (колонка F=6). */
export async function updateStatus(task: Task, status: TaskStatus): Promise<void> {
  await updateCell(task.rowIndex, 6, status);
}

/** Записать заголовки в строку (колонка D=4). */
export async function writeHeadlines(task: Task, headlines: string[]): Promise<void> {
  const line = headlines
    .map((h) => h.slice(0, MAX_ONE_HEADLINE))
    .join('\n')
    .slice(0, MAX_CELL_HEADLINES);
  await updateCell(task.rowIndex, 4, line);
}

/** Записать ключевые запросы (колонка E=5). */
export async function writeKeywords(task: Task, keywords: string[]): Promise<void> {
  const line = keywords.join(', ').slice(0, MAX_CELL_KEYWORDS);
  await updateCell(task.rowIndex, 5, line);
}

/** Записать результат генерации (превью, источники, картинка, UTM, стоимость) и установить статус. */
export async function writeGenerationResult(
  task: Task,
  result: ArticleResult,
  newStatus: TaskStatus = 'Готово к проверке'
): Promise<void> {
  const row = task.rowIndex;
  const preview = (result.previewText ?? '').slice(0, MAX_CELL_PREVIEW);
  const sources = (result.sources ?? '').slice(0, MAX_CELL_SOURCES);
  const imageUrl = (result.imageUrl ?? '').slice(0, MAX_CELL_URL);
  const utmUrl = (result.utmUrl ?? '').slice(0, MAX_CELL_URL);
  const data = [
    { range: `'${SHEET_NAME}'!G${row}`, values: [[preview]] },
    { range: `'${SHEET_NAME}'!H${row}`, values: [[sources]] },
    { range: `'${SHEET_NAME}'!I${row}`, values: [[imageUrl]] },
    { range: `'${SHEET_NAME}'!J${row}`, values: [[utmUrl]] },
    { range: `'${SHEET_NAME}'!L${row}`, values: [[result.costTextRub]] },
    { range: `'${SHEET_NAME}'!M${row}`, values: [[result.costImageRub]] },
    { range: `'${SHEET_NAME}'!N${row}`, values: [[result.costTotalRub]] },
    { range: `'${SHEET_NAME}'!O${row}`, values: [[new Date().toISOString().slice(0, 10)]] },
    { range: `'${SHEET_NAME}'!F${row}`, values: [[newStatus]] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data },
  });
}


/** Записать ссылку на пост и статус «Опубликовано». */
export async function writePublished(task: Task, postUrl: string): Promise<void> {
  const row = task.rowIndex;
  const url = postUrl.slice(0, MAX_CELL_URL);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `'${SHEET_NAME}'!K${row}`, values: [[url]] },
        { range: `'${SHEET_NAME}'!F${row}`, values: [['Опубликовано']] },
      ],
    },
  });
}

/** Установить статус «Ошибка». */
export async function setStatusError(task: Task): Promise<void> {
  await updateCell(task.rowIndex, 6, 'Ошибка');
}
