/**
 * Чтение листа «Настройки»: Роль, промпты, ДНК, справочник каталога, UTM, расписание.
 */
import { google } from 'googleapis';
import { config } from '../config';
import { logWarn } from '../utils/logger';
import { sheets, spreadsheetId } from './client';
import type { Settings } from '../types';

const SHEET_NAME = 'Настройки';

type StructuralElement = {
  paragraph?: { elements?: Array<{ textRun?: { content?: string } }> };
  table?: {
    tableRows?: Array<{
      tableCells?: Array<{ content?: StructuralElement[] }>;
    }>;
  };
};

/** Извлечь текст из массива структурных элементов (параграфы). */
function extractTextFromContent(elements: StructuralElement[] | undefined): string {
  const parts: string[] = [];
  for (const el of elements ?? []) {
    if (el.paragraph?.elements) {
      for (const run of el.paragraph.elements) {
        if (run.textRun?.content) parts.push(run.textRun.content);
      }
    }
  }
  return parts.join('').trim();
}

/** Загрузка текста из Google Docs по URL (параграфы). */
async function fetchDocContent(docUrl: string): Promise<string> {
  try {
    const match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return '';
    const docId = match[1];
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });
    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: docId });
    const content = res.data.body?.content as StructuralElement[] | undefined;
    if (!content) return '';
    const parts: string[] = [];
    for (const el of content) {
      if (el.paragraph?.elements) {
        for (const run of el.paragraph.elements) {
          if (run.textRun?.content) parts.push(run.textRun.content);
        }
      }
    }
    return parts.join('').trim();
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logWarn('fetchDocContent error', { docUrl, error: err });
    return '';
  }
}

/** Загрузка справочника каталога: параграфы (строки "Раздел\tURL") + таблицы (колонки с названием и ссылкой). */
async function fetchCatalogDocContent(docUrl: string): Promise<string> {
  try {
    const match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return '';
    const docId = match[1];
    const auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
    });
    const docs = google.docs({ version: 'v1', auth });
    const res = await docs.documents.get({ documentId: docId });
    const content = res.data.body?.content as StructuralElement[] | undefined;
    if (!content) return '';

    const lines: string[] = [];

    for (const el of content) {
      if (el.paragraph?.elements) {
        const text = extractTextFromContent([el]);
        if (text) lines.push(text);
      }
      if (el.table?.tableRows) {
        for (const row of el.table.tableRows) {
          const cells = (row.tableCells ?? []).map((cell) =>
            extractTextFromContent(cell.content)
          );
          const urlIndex = cells.findIndex((c) => /^https?:\/\//i.test(c.trim()));
          if (urlIndex >= 0) {
            const url = cells[urlIndex].trim();
            const nameCandidate =
              urlIndex > 0
                ? (cells[urlIndex - 1] ?? '').trim()
                : (cells.find((c) => c.trim() && !/^https?:\/\//i.test(c.trim())) ?? '').trim();
            const name = nameCandidate && !/^https?:\/\//i.test(nameCandidate) ? nameCandidate : '';
            if (name && url) lines.push(`${name}\t${url}`);
          }
        }
      }
    }

    return lines.join('\n');
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logWarn('fetchCatalogDocContent error', { docUrl, error: err });
    return '';
  }
}

/**
 * Парсинг режима генерации картинки из значения ячейки. "Сразу" → immediate, иначе → scheduled. Экспорт для тестов.
 */
export function parseImageGenerationMode(value: string): 'immediate' | 'scheduled' {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'сразу' || v === 'immediate' || v === '1') return 'immediate';
  return 'scheduled';
}

/**
 * Парсинг справочника каталога: строки вида "Раздел\tURL" или "Раздел | URL". Экспорт для тестов.
 */
export function parseCatalogMap(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  for (const line of lines) {
    const sep = line.includes('\t') ? '\t' : (line.includes('|') ? '|' : null);
    if (sep) {
      const [name, url] = line.split(sep).map((s) => s.trim());
      if (name && url) map[name] = url;
    }
  }
  return map;
}

/**
 * Настройки хранятся в виде пар ключ-значение (колонки A, B) или одной таблицы.
 * Предполагаем: A — параметр, B — значение. Строки: Роль, Промпт 1, Промпт 2, Промпт 3, ДНК Бренда, Справочник каталога, Справочник фото, Шаблон UTM, Telegram Channel ID, Макс. статей в день, Режим модерации, Время сводки.
 */
export async function readSettings(): Promise<Settings> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${SHEET_NAME}'!A1:B50`,
  });
  const rows = (res.data.values ?? []) as string[][];
  const byKey: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row[0] ?? '').trim();
    const val = String(row[1] ?? '').trim();
    if (key) byKey[key] = val;
  }

  const get = (key: string, def: string) => byKey[key] ?? def;
  const dnaBrandUrl = get('ДНК Бренда', get('ДНК бренда', ''));
  const catalogDocUrl = get('Справочник каталога', get('Справочник каталога', ''));
  const referencePhotoDocUrl = get('Справочник фото', '');

  const [dnaBrandText, catalogRaw, referencePhotoRaw] = await Promise.all([
    dnaBrandUrl ? fetchDocContent(dnaBrandUrl) : Promise.resolve(''),
    catalogDocUrl ? fetchCatalogDocContent(catalogDocUrl) : Promise.resolve(''),
    referencePhotoDocUrl ? fetchDocContent(referencePhotoDocUrl) : Promise.resolve(''),
  ]);

  if (dnaBrandUrl && !dnaBrandText.trim()) {
    logWarn('ДНК Бренда: документ пуст или не загружен', { url: dnaBrandUrl });
  }
  if (catalogDocUrl && !catalogRaw.trim()) {
    logWarn('Справочник каталога: документ пуст или не загружен', { url: catalogDocUrl });
  }
  const catalogMap = parseCatalogMap(catalogRaw);
  const referencePhotoMap = parseCatalogMap(referencePhotoRaw);

  const maxArticlesPerDay = Math.max(1, parseInt(get('Макс. статей в день', '10'), 10) || 10);
  const moderationEnabled = /^(1|да|yes|вкл|on|true)$/i.test(get('Режим модерации', 'вкл'));

  return {
    role: get('Роль', 'Ведущий агроном питомника с 20-летним стажем'),
    prompt1: get('Промпт 1', ''),
    prompt2: get('Промпт 2', ''),
    prompt3: get('Промпт 3', ''),
    promptImage: get('Промпт картинки', ''),
    promptImageWithReference: get('Промпт картинки с референсом', ''),
    dnaBrandUrl,
    catalogDocUrl,
    dnaBrandText,
    catalogMap,
    referencePhotoMap,
    utmTemplate: get('Шаблон UTM', '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}'),
    telegramChannelId: get('Telegram Channel ID', get('Channel ID', config.telegram.channelId)),
    maxArticlesPerDay,
    moderationEnabled,
    pollInterval: config.schedule.pollIntervalMs,
    dailySummaryTime: get('Время сводки', '21:00'),
    generationTime: (get('Время генерации', '05:00') || '05:00').trim() || '05:00',
    imageGenerationMode: parseImageGenerationMode(get('Режим генерации картинки', 'По времени')),
    logoUrl: (() => {
      const url = get('URL логотипа', '').trim();
      return url && /^https?:\/\//i.test(url) ? url : undefined;
    })(),
    publishIntervalMin: Math.max(1, parseInt(get('Интервал публикации (мин)', '60'), 10) || 60),
    publishWindowStart: (get('Публикация с', '') || '').trim(),
    publishWindowEnd: (get('Публикация до', '') || '').trim(),
    groundingModel: get('Модель граундинга', '') || undefined,
    textModel: get('Модель текста', '') || undefined,
    imageModel: get('Модель картинки', '') || undefined,
    headlinesCount: Math.max(1, parseInt(get('Макс. заголовков', '30'), 10) || 30),
  };
}
