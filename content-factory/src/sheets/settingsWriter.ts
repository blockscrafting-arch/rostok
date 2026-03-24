/**
 * Запись настроек онбординга в лист «Настройки» клиентской таблицы (для менеджера в UI).
 * Источник правды для пайплайна мульти-клиента — PostgreSQL (mergeSettings); лист дублирует ключевые поля для правки глазами.
 *
 * Основной (legacy) клиент: в «ДНК Бренда» часто URL Google Doc. Новые клиенты из веб-онбординга — текст ДНК;
 * пишем в ту же метку «ДНК Бренда», подменяя B (для новых таблиц это ожидаемо).
 */
import { sheets } from './client';
import type { OnboardingSettingsForDb } from '../types/onboarding';
import { logInfo, logWarn, serializeError } from '../utils/logger';

const SHEET_NAME = 'Настройки';

/** Синонимы ключей шаблона: settingsWriter пишет «CTA», шаблон содержит «Призыв к действию (CTA)» и т.д. */
const KEY_SYNONYMS: Record<string, string[]> = {
  'ДНК Бренда': ['ДНК бренда', 'Сайт (Ссылка на Документ)'],
  'Призыв к действию (CTA)': ['CTA', 'Призыв к действию'],
  'Стиль картинок': ['Стиль картинки'],
  'Ссылка на логотип для картинок': ['URL логотипа'],
  'Максимум статей в день': ['Макс. статей в день'],
  'Интервал публикаций (минуты)': ['Интервал публикации (мин)'],
  'Время генерации картинок': ['Время генерации'],
  'UTM-шаблон': ['Шаблон UTM'],
  'Время ежедневной сводки': ['Время сводки'],
  'Кол-во заголовков': ['Макс. заголовков'],
  'Telegram-канал (id)': ['Telegram Channel ID', 'Channel ID'],
};

function rowForSettingsKey(key: string, keyToRow: Map<string, number>): number | undefined {
  const direct = keyToRow.get(key);
  if (direct != null) return direct;
  for (const [canonical, aliases] of Object.entries(KEY_SYNONYMS)) {
    const allNames = [canonical, ...aliases];
    if (allNames.includes(key)) {
      for (const name of allNames) {
        const row = keyToRow.get(name);
        if (row != null) return row;
      }
    }
  }
  return undefined;
}

/** Пары ключ (кол. A) — значение (кол. B) для листа «Настройки». Экспорт для тестов. */
export function buildOnboardingSettingsSheetPairs(settings: OnboardingSettingsForDb): Array<[string, string]> {
  const imageModeLabel =
    String(settings.imageGenMode ?? '').toLowerCase() === 'immediate' ? 'Сразу' : 'По времени';

  const pairs: Array<[string, string]> = [
    ['Роль', settings.role?.trim() ?? ''],
    ['Максимум статей в день', String(Math.max(1, settings.maxArticlesPerDay ?? 5))],
    ['Режим модерации', settings.moderationEnabled ? 'да' : 'нет'],
    ['Время генерации картинок', (settings.generationTime ?? '05:00').trim() || '05:00'],
    ['Режим генерации картинки', imageModeLabel],
    ['Интервал публикаций (минуты)', String(Math.max(1, settings.publishIntervalMin ?? 60))],
    ['Ссылка на логотип для картинок', settings.logoUrl?.trim() ?? ''],
    ['ДНК Бренда', settings.dnaBrand?.trim() ?? ''],
    ['Детали продукта', settings.productDetails?.trim() ?? ''],
    ['Призыв к действию (CTA)', settings.cta?.trim() ?? ''],
    ['Стиль картинок', settings.imageStyle?.trim() ?? ''],
    ['Тональность', settings.tonality?.trim() ?? ''],
    ['Аудитория', settings.targetAudience?.trim() ?? ''],
    ['Негативный промпт', settings.negativePrompt?.trim() ?? ''],
    ['Типы контента', (settings.contentTypes ?? []).join(', ')],
    ['Доверенные сайты', (settings.trustedSites ?? []).join('\n')],
    ['Режим операции ИИ', settings.operationMode?.trim() ?? 'safe'],
  ];

  return pairs;
}

/**
 * Обновить или добавить строки A:B на листе «Настройки».
 * Не бросает наружу — при ошибке пишет warn (онбординг уже зафиксирован в БД).
 */
export async function syncOnboardingSettingsToSettingsSheet(
  spreadsheetId: string,
  settings: OnboardingSettingsForDb
): Promise<void> {
  const sid = spreadsheetId.trim();
  if (!sid) return;

  const pairs = buildOnboardingSettingsSheetPairs(settings);
  if (pairs.length === 0) return;

  try {
    const getRes = await sheets.spreadsheets.values.get({
      spreadsheetId: sid,
      range: `'${SHEET_NAME}'!A1:B300`,
    });
    const rows = (getRes.data.values ?? []) as string[][];
    const keyToRow = new Map<string, number>();
    for (let i = 0; i < rows.length; i++) {
      const key = String(rows[i]?.[0] ?? '').trim();
      if (key) keyToRow.set(key, i + 1);
    }

    let nextRow = rows.length + 1;
    const data: { range: string; values: string[][] }[] = [];

    for (const [key, val] of pairs) {
      const rowNum = rowForSettingsKey(key, keyToRow);
      if (rowNum != null) {
        data.push({ range: `'${SHEET_NAME}'!B${rowNum}`, values: [[val]] });
      } else {
        data.push({
          range: `'${SHEET_NAME}'!A${nextRow}:B${nextRow}`,
          values: [[key, val]],
        });
        keyToRow.set(key, nextRow);
        nextRow += 1;
      }
    }

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sid,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data,
      },
    });
    logInfo('Onboarding settings synced to sheet', { spreadsheetId: sid, rowsUpdated: data.length });
  } catch (e) {
    logWarn('syncOnboardingSettingsToSettingsSheet failed', {
      spreadsheetId: sid,
      error: serializeError(e).message,
    });
  }
}
