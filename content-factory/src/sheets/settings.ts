/**
 * Чтение листа «Настройки»: Роль, промпты, ДНК, справочник каталога, UTM, расписание.
 */
import { google } from 'googleapis';
import { config } from '../config';
import { logWarn } from '../utils/logger';
import { sheets, spreadsheetId } from './client';
import type { Settings } from '../types';

const SHEET_NAME = 'Настройки';

/** Загрузка текста из Google Docs по URL. */
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
    const content = res.data.body?.content;
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
  } catch {
    return '';
  }
}

/**
 * Парсинг справочника каталога: строки вида "Раздел\tURL" или "Раздел | URL".
 */
function parseCatalogMap(text: string): Record<string, string> {
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
 * Предполагаем: A — параметр, B — значение. Строки: Роль, Промпт 1, Промпт 2, Промпт 3, ДНК Бренда, Справочник каталога, Шаблон UTM, Telegram Channel ID, Макс. статей в день, Режим модерации, Время сводки.
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

  const [dnaBrandText, catalogRaw] = await Promise.all([
    dnaBrandUrl ? fetchDocContent(dnaBrandUrl) : Promise.resolve(''),
    catalogDocUrl ? fetchDocContent(catalogDocUrl) : Promise.resolve(''),
  ]);

  if (dnaBrandUrl && !dnaBrandText.trim()) {
    logWarn('ДНК Бренда: документ пуст или не загружен', { url: dnaBrandUrl });
  }
  if (catalogDocUrl && !catalogRaw.trim()) {
    logWarn('Справочник каталога: документ пуст или не загружен', { url: catalogDocUrl });
  }

  const catalogMap = parseCatalogMap(catalogRaw);

  const maxArticlesPerDay = Math.max(1, parseInt(get('Макс. статей в день', '10'), 10) || 10);
  const moderationEnabled = /^(1|да|yes|вкл|on|true)$/i.test(get('Режим модерации', 'вкл'));

  return {
    role: get('Роль', 'Ведущий агроном питомника с 20-летним стажем'),
    prompt1: get('Промпт 1', ''),
    prompt2: get('Промпт 2', ''),
    prompt3: get('Промпт 3', ''),
    dnaBrandUrl,
    catalogDocUrl,
    dnaBrandText,
    catalogMap,
    utmTemplate: get('Шаблон UTM', '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}'),
    telegramChannelId: get('Telegram Channel ID', get('Channel ID', config.telegram.channelId)),
    maxArticlesPerDay,
    moderationEnabled,
    pollInterval: config.schedule.pollIntervalMs,
    dailySummaryTime: get('Время сводки', '21:00'),
  };
}
