/**
 * Чтение листа «Задания»: все строки с данными, фильтрация по статусу.
 */
import { sheets, spreadsheetId } from './client';
import type { Task, TaskStatus } from '../types';

const SHEET_NAME = 'Задания';

/** Индексы колонок (0-based). Порядок по ТЗ. */
const COL = {
  platform: 0,
  keyword: 1,
  frequencyLimit: 2,
  headline: 3,
  keywords: 4,
  status: 5,
  previewText: 6,
  sources: 7,
  imageUrl: 8,
  utmUrl: 9,
  postUrl: 10,
  costText: 11,
  costImage: 12,
  costTotal: 13,
  date: 14,
  comment: 15,
} as const;

const VALID_STATUSES: TaskStatus[] = [
  'Новое',
  'На согласовании',
  'Согласовано',
  'Генерация',
  'Готово к проверке',
  'Одобрено',
  'Опубликовано',
  'Ошибка',
  'На доработку',
];

function parseRow(row: unknown[], sheetRowIndex: number): Task | null {
  const keyword = String(row[COL.keyword] ?? '').trim();
  const statusRaw = String(row[COL.status] ?? '').trim();
  if (!keyword) return null;
  if (statusRaw && !VALID_STATUSES.includes(statusRaw as TaskStatus)) return null;
  const status = statusRaw as TaskStatus;

  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isNaN(n) ? 0 : n;
  };

  return {
    rowIndex: sheetRowIndex,
    platform: String(row[COL.platform] ?? '').trim(),
    keyword,
    frequencyLimit: num(row[COL.frequencyLimit]) || 300,
    headline: String(row[COL.headline] ?? '').trim() || null,
    keywords: String(row[COL.keywords] ?? '').trim() || null,
    status: (status && VALID_STATUSES.includes(status) ? status : 'Новое') as TaskStatus,
    previewText: String(row[COL.previewText] ?? '').trim() || null,
    sources: String(row[COL.sources] ?? '').trim() || null,
    imageUrl: String(row[COL.imageUrl] ?? '').trim() || null,
    utmUrl: String(row[COL.utmUrl] ?? '').trim() || null,
    postUrl: String(row[COL.postUrl] ?? '').trim() || null,
    costText: row[COL.costText] != null ? String(row[COL.costText]).trim() : null,
    costImage: row[COL.costImage] != null ? String(row[COL.costImage]).trim() : null,
    costTotal: row[COL.costTotal] != null ? String(row[COL.costTotal]).trim() : null,
    date: row[COL.date] != null ? String(row[COL.date]).trim() : null,
    comment: String(row[COL.comment] ?? '').trim() || null,
  };
}

/**
 * Получить все задачи с данными (без заголовка).
 * Фильтр по статусу не применяется — вызывающий код фильтрует сам.
 */
export async function readTasks(): Promise<Task[]> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_NAME}'!A2:P`,
  });
  const rows = (res.data.values ?? []) as unknown[][];
  const tasks: Task[] = [];
  for (let i = 0; i < rows.length; i++) {
    const task = parseRow(rows[i], i + 2);
    if (task) tasks.push(task);
  }
  return tasks;
}

export { COL as TASKS_COL };
