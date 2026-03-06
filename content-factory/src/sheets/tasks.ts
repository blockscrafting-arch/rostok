/**
 * Чтение листа «Задания»: все строки с данными, фильтрация по статусу.
 */
import { sheets, spreadsheetId } from './client';
import type { Task, TaskStatus, FrequencyLimit } from '../types';

const SHEET_NAME = 'Задания';

/** Парсит ячейку лимита частотности: "300-500" → { min: 300, max: 500 }, "300" → 300. */
function parseFrequencyLimit(v: unknown): FrequencyLimit {
  const s = String(v ?? '').trim();
  const range = s.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
  if (range) {
    const min = parseInt(range[1], 10);
    const max = parseInt(range[2], 10);
    return min <= max ? { min, max } : { min: max, max: min };
  }
  const n = Number(s);
  return Number.isNaN(n) || n < 0 ? 300 : n;
}

/** Индексы колонок (0-based). Без колонки «Площадка»: A=Ключевое слово, B=Лимит частотности, ... O=Комментарий. */
const COL = {
  keyword: 0,
  frequencyLimit: 1,
  headline: 2,
  keywords: 3,
  status: 4,
  previewText: 5,
  sources: 6,
  imageUrl: 7,
  utmUrl: 8,
  postUrl: 9,
  costText: 10,
  costImage: 11,
  costTotal: 12,
  date: 13,
  comment: 14,
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
    keyword,
    frequencyLimit: parseFrequencyLimit(row[COL.frequencyLimit]),
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
    range: `'${SHEET_NAME}'!A2:O`,
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
