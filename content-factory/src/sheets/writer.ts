/**
 * Запись результатов в лист «Задания»: статус, заголовки, превью, источники, ссылки, стоимость.
 */
import { sheets, spreadsheetId, getSheetId } from './client';
import type { SheetTask, TaskStatus } from '../types';
import type { ArticleResult } from '../types';
import type { FrequencyLimit } from '../types';
import type { HeadlineItem } from '../ai/headlines';

const SHEET_NAME = 'Задания';

/** Лимиты длины в ячейках (снижают риск ошибок интерфейса Google Таблиц). */
const MAX_CELL_PREVIEW = 32_000;
const MAX_CELL_SOURCES = 32_000;
const MAX_CELL_URL = 2_048;
const MAX_CELL_HEADLINES = 32_000;
const MAX_CELL_KEYWORDS = 32_000;
const MAX_ONE_HEADLINE = 500;

/** Экранирование пользовательского ввода для защиты от formula injection: ведущие =, +, -, @. */
export function escapeFormulaCell(value: string): string {
  const s = String(value ?? '');
  const t = s.trimStart();
  if (/^[=+\-@]/.test(t)) return "'" + s;
  return s;
}

/** Колонки листа без «Площадка»: A=Ключевое слово, B=Лимит, C=Заголовок, D=Ключевые запросы, E=Статус, F=Превью, G=Источники, H=Картинка, I=UTM, J=Пост, K=стоимость текста, L=картинки, M=итого, N=дата, O=Комментарий. Экспорт для тестов. */
export function colLetter(col1Based: number): string {
  let s = '';
  let n = col1Based - 1;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Опциональный контекст таблицы для мульти-клиента. */
export type SheetContext = { spreadsheetId?: string };

/** Обновить одну ячейку (sheetRow — номер строки в листе, 2-based). RAW — защита от formula injection. */
async function updateCell(
  sheetRow: number,
  col1Based: number,
  value: string | number,
  ctx?: SheetContext
): Promise<void> {
  const sid = ctx?.spreadsheetId;
  const range = `'${SHEET_NAME}'!${colLetter(col1Based)}${sheetRow}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid ?? spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values: [[value]] },
  });
}

/** Обновить статус строки (колонка E=5). */
export async function updateStatus(task: SheetTask, status: TaskStatus, ctx?: SheetContext): Promise<void> {
  await updateCell(task.rowIndex, 5, status, ctx);
}

/** Записать заголовки в строку (колонка C=3). */
export async function writeHeadlines(task: SheetTask, headlines: string[], ctx?: SheetContext): Promise<void> {
  const line = headlines
    .map((h) => h.slice(0, MAX_ONE_HEADLINE))
    .join('\n')
    .slice(0, MAX_CELL_HEADLINES);
  await updateCell(task.rowIndex, 3, line, ctx);
}

/** Записать ключевые запросы (колонка D=4). */
export async function writeKeywords(task: SheetTask, keywords: string[], ctx?: SheetContext): Promise<void> {
  const line = keywords.join(', ').slice(0, MAX_CELL_KEYWORDS);
  await updateCell(task.rowIndex, 4, line, ctx);
}

/** Записать стоимость заголовков в строку (K, L, M). costPerRow — доля на эту строку. */
export async function writeHeadlinesCost(task: SheetTask, costPerRow: number, ctx?: SheetContext): Promise<void> {
  if (costPerRow <= 0) return;
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const row = task.rowIndex;
  const data = [
    { range: `'${SHEET_NAME}'!K${row}`, values: [[costPerRow]] },
    { range: `'${SHEET_NAME}'!L${row}`, values: [[0]] },
    { range: `'${SHEET_NAME}'!M${row}`, values: [[costPerRow]] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

/** Сериализовать лимит частотности для записи в ячейку. Экспорт для тестов. */
export function formatFrequencyLimit(limit: FrequencyLimit): string {
  if (typeof limit === 'number') return String(limit);
  return `${limit.min}-${limit.max}`;
}

/**
 * Вставить N новых строк ниже текущей и заполнить их (ключ, лимит, заголовок, НЧ-запросы, статус, стоимость).
 * Исходная строка должна быть обновлена отдельно (writeKeywords, writeHeadlines, writeHeadlinesCost для первого заголовка).
 * @param task — исходная задача (rowIndex, keyword, frequencyLimit)
 * @param items — заголовки и КЗ для новых строк (2..N, первый уже в исходной строке)
 * @param headlinesCostPerRow — доля стоимости заголовков на каждую строку (K, L=0, M)
 */
export async function insertTaskRows(
  task: SheetTask,
  items: HeadlineItem[],
  headlinesCostPerRow = 0,
  ctx?: SheetContext
): Promise<void> {
  if (items.length === 0) return;

  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const sheetId = await getSheetId(sid);
  const startRow0 = task.rowIndex; // 0-based: строка после исходной
  const numRows = items.length;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: startRow0,
              endIndex: startRow0 + numRows,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  const limitStr = formatFrequencyLimit(task.frequencyLimit);
  const status = 'На согласовании';
  const costText = headlinesCostPerRow > 0 ? headlinesCostPerRow : '';
  const costImage = 0;
  const costTotal = headlinesCostPerRow > 0 ? headlinesCostPerRow : '';

  const values = items.map((item, i) => {
    const sheetRow = startRow0 + 1 + i;
    return [
      escapeFormulaCell(task.keyword),
      escapeFormulaCell(limitStr),
      escapeFormulaCell(item.headline.slice(0, MAX_ONE_HEADLINE)),
      escapeFormulaCell(item.keywords.join(', ').slice(0, MAX_CELL_KEYWORDS)),
      status,
      '', '', '', '', '', // F..J
      costText,
      costImage,
      costTotal,
      '', '', // N, O
      `=IF(F${sheetRow}="";0;LEN(F${sheetRow}))`, // P = символы (0 если F пусто)
      '', // Q = Запланировано
    ];
  });

  // 0-based startRow0 → 1-based sheet row = startRow0 + 1. Колонки A–Q. USER_ENTERED чтобы P распозналась как формула.
  const range = `'${SHEET_NAME}'!A${startRow0 + 1}:Q${startRow0 + numRows}`;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sid,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
}

/** Результат только текстовой части (без картинки). Для статуса «Текст готов, ждём картинку». */
export interface TextOnlyResult {
  previewText: string;
  sources: string;
  utmUrl: string;
  costTextUsd: number;
}

/** Опции записи результата текста: статус после (по умолчанию «Текст готов, ждём картинку»). При «Готово к проверке» картинку не трогаем, L не перезаписываем. */
export interface WriteTextResultOptions {
  statusAfter?: TaskStatus;
}

/** Записать результат генерации текста (F, G, I, K, L=0 или не трогаем, M, N, E). P не трогаем — там формула. */
export async function writeTextResult(
  task: SheetTask,
  result: TextOnlyResult,
  options: WriteTextResultOptions = {},
  ctx?: SheetContext
): Promise<void> {
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const { statusAfter = 'Текст готов, ждём картинку' } = options;
  const row = task.rowIndex;
  const preview = (result.previewText ?? '').slice(0, MAX_CELL_PREVIEW);
  const sources = (result.sources ?? '').slice(0, MAX_CELL_SOURCES);
  const utmUrl = (result.utmUrl ?? '').slice(0, MAX_CELL_URL);
  const costTextUsd = result.costTextUsd;
  const keepImage = statusAfter === 'Готово к проверке';
  const costImageUsd = keepImage ? parseFloat(String(task.costImage ?? '')) || 0 : 0;
  const costTotalUsd = costTextUsd + costImageUsd;
  const data = [
    { range: `'${SHEET_NAME}'!F${row}`, values: [[preview]] },
    { range: `'${SHEET_NAME}'!G${row}`, values: [[sources]] },
    { range: `'${SHEET_NAME}'!I${row}`, values: [[utmUrl]] },
    { range: `'${SHEET_NAME}'!K${row}`, values: [[costTextUsd]] },
    ...(keepImage ? [] : [{ range: `'${SHEET_NAME}'!L${row}`, values: [[0]] }]),
    { range: `'${SHEET_NAME}'!M${row}`, values: [[costTotalUsd]] },
    { range: `'${SHEET_NAME}'!N${row}`, values: [[new Date().toISOString().slice(0, 10)]] },
    { range: `'${SHEET_NAME}'!E${row}`, values: [[statusAfter]] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

/** Записать результат полной генерации (текст + картинка). Сейчас пайплайн разделён: текст → writeTextResult, картинка → writeRegeneratedImage. Функция оставлена для совместимости и возможного сценария «всё за один вызов». */
export async function writeGenerationResult(
  task: SheetTask,
  result: ArticleResult,
  newStatus: TaskStatus = 'Готово к проверке',
  ctx?: SheetContext
): Promise<void> {
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const row = task.rowIndex;
  const preview = (result.previewText ?? '').slice(0, MAX_CELL_PREVIEW);
  const sources = (result.sources ?? '').slice(0, MAX_CELL_SOURCES);
  const imageUrl = (result.imageUrl ?? '').slice(0, MAX_CELL_URL);
  const utmUrl = (result.utmUrl ?? '').slice(0, MAX_CELL_URL);
  const existingCostText = parseFloat(String(task.costText ?? '')) || 0;
  const existingCostImage = parseFloat(String(task.costImage ?? '')) || 0;
  const costTextUsd = existingCostText + result.costTextUsd;
  const costImageUsd = existingCostImage + result.costImageUsd;
  const costTotalUsd = costTextUsd + costImageUsd;
  const data = [
    { range: `'${SHEET_NAME}'!F${row}`, values: [[preview]] },
    { range: `'${SHEET_NAME}'!G${row}`, values: [[sources]] },
    { range: `'${SHEET_NAME}'!H${row}`, values: [[imageUrl]] },
    { range: `'${SHEET_NAME}'!I${row}`, values: [[utmUrl]] },
    { range: `'${SHEET_NAME}'!K${row}`, values: [[costTextUsd]] },
    { range: `'${SHEET_NAME}'!L${row}`, values: [[costImageUsd]] },
    { range: `'${SHEET_NAME}'!M${row}`, values: [[costTotalUsd]] },
    { range: `'${SHEET_NAME}'!N${row}`, values: [[new Date().toISOString().slice(0, 10)]] },
    { range: `'${SHEET_NAME}'!E${row}`, values: [[newStatus]] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

/** Записать только перегенерированную картинку и стоимость (H, L, M, E). Итого = стоимость текста из строки + costImageUsd. */
export async function writeRegeneratedImage(
  task: SheetTask,
  imageUrl: string,
  costImageUsd: number,
  newStatus: TaskStatus = 'Готово к проверке',
  ctx?: SheetContext
): Promise<void> {
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const row = task.rowIndex;
  const costTextUsd = parseFloat(String(task.costText ?? '')) || 0;
  const costTotalUsd = costTextUsd + costImageUsd;
  const data = [
    { range: `'${SHEET_NAME}'!H${row}`, values: [[imageUrl.slice(0, MAX_CELL_URL)]] },
    { range: `'${SHEET_NAME}'!L${row}`, values: [[costImageUsd]] },
    { range: `'${SHEET_NAME}'!M${row}`, values: [[costTotalUsd]] },
    { range: `'${SHEET_NAME}'!E${row}`, values: [[newStatus]] },
  ];
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: { valueInputOption: 'RAW', data },
  });
}

/** Записать ссылку на пост и статус «Опубликовано». */
export async function writePublished(task: SheetTask, postUrl: string, ctx?: SheetContext): Promise<void> {
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const row = task.rowIndex;
  const url = postUrl.slice(0, MAX_CELL_URL);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sid,
    requestBody: {
      valueInputOption: 'RAW',
      data: [
        { range: `'${SHEET_NAME}'!J${row}`, values: [[url]] },
        { range: `'${SHEET_NAME}'!E${row}`, values: [['Опубликовано']] },
      ],
    },
  });
}

/** Установить статус «Ошибка». */
export async function setStatusError(task: SheetTask, ctx?: SheetContext): Promise<void> {
  await updateCell(task.rowIndex, 5, 'Ошибка', ctx);
}

/**
 * Скрыть указанные строки листа «Задания» (данные не удаляются).
 * @param rowIndices — номера строк в таблице (1-based: 2 = первая строка данных).
 */
export async function hideTaskRows(rowIndices: number[], ctx?: SheetContext): Promise<void> {
  const unique = [...new Set(rowIndices)].filter((r) => r >= 2);
  if (unique.length === 0) return;
  const sid = ctx?.spreadsheetId ?? spreadsheetId;
  const sheetId = await getSheetId(sid);
  const requests = unique
    .map((rowIndex1Based) => ({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: rowIndex1Based - 1,
          endIndex: rowIndex1Based,
        },
        properties: { hiddenByUser: true },
        fields: 'hiddenByUser',
      },
    }));
  if (requests.length === 0) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sid,
    requestBody: { requests },
  });
}
