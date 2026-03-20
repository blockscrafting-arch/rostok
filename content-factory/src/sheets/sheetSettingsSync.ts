/**
 * Синхронизация листа «Настройки» Google Таблицы → PostgreSQL (client_settings) для мульти-клиента.
 * Вызывается планировщиком перед mergeSettings; кэш настроек воркера инвалидируется.
 */
import type { ClientSettings } from '@prisma/client';
import { prisma } from '../db/client';
import { getClientWithSettings } from '../db/repositories/clients';
import { readSettingsWithKeyMap } from './settings';
import { invalidateClientSettingsCache } from '../workers/loadJobData';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import type { Settings } from '../types';

/** Значение по одному из ключей в колонке A (непустое). */
export function kvGet(byKey: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = byKey[k];
    if (v !== undefined && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

/**
 * Собрать поля для prisma.clientSettings.update из readSettings + сырых ключей листа
 * (типы контента, CTA и т.д. — только в byKey).
 */
export function buildClientSettingsUpdateFromSheet(
  settings: Settings,
  byKey: Record<string, string>,
  prev: ClientSettings
): Omit<
  ClientSettings,
  'id' | 'clientId' | 'updatedAt' | 'frequencyLimit'
> & { frequencyLimit?: string | null } {
  const dnaRaw = kvGet(byKey, 'ДНК Бренда', 'ДНК бренда');
  const dnaBrand = (
    settings.dnaBrandText?.trim() ||
    dnaRaw ||
    prev.dnaBrand ||
    ''
  ).trim();

  const typesStr = kvGet(byKey, 'Типы контента');
  const contentTypes = typesStr
    ? typesStr.split(',').map((s) => s.trim()).filter(Boolean)
    : [...prev.contentTypes];

  const sitesStr = kvGet(byKey, 'Доверенные сайты');
  const trustedSites = sitesStr
    ? sitesStr.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    : [...prev.trustedSites];

  const op = kvGet(byKey, 'Режим операции ИИ').toLowerCase();
  const operationMode = op === 'turbo' ? 'turbo' : op === 'safe' ? 'safe' : prev.operationMode;

  const pd = kvGet(byKey, 'Детали продукта');
  const productDetails = pd !== '' ? pd : prev.productDetails;

  return {
    role: settings.role,
    contentTypes,
    trustedSites,
    productDetails,
    dnaBrand: dnaBrand || prev.dnaBrand,
    cta: kvGet(byKey, 'CTA') || prev.cta,
    imageStyle: kvGet(byKey, 'Стиль картинки') || prev.imageStyle,
    tonality: kvGet(byKey, 'Тональность') || prev.tonality,
    targetAudience: kvGet(byKey, 'Аудитория') || prev.targetAudience,
    negativePrompt: kvGet(byKey, 'Негативный промпт') || prev.negativePrompt,
    operationMode,
    logoUrl: settings.logoUrl ?? prev.logoUrl,
    utmTemplate: settings.utmTemplate?.trim() ? settings.utmTemplate : prev.utmTemplate,
    frequencyLimit: prev.frequencyLimit,
    maxArticlesPerDay: settings.maxArticlesPerDay,
    moderationEnabled: settings.moderationEnabled,
    publishIntervalMin: settings.publishIntervalMin,
    publishWindowStart: settings.publishWindowStart || '',
    publishWindowEnd: settings.publishWindowEnd || '',
    dailySummaryTime: settings.dailySummaryTime,
    generationTime: settings.generationTime,
    imageGenMode: settings.imageGenerationMode === 'immediate' ? 'immediate' : 'scheduled',
    headlinesCount: settings.headlinesCount ?? prev.headlinesCount,
    textModel: settings.textModel ?? prev.textModel,
    imageModel: settings.imageModel ?? prev.imageModel,
    groundingModel: settings.groundingModel ?? prev.groundingModel,
  };
}

/**
 * Прочитать лист клиента и обновить client_settings (+ опционально telegramChannelId клиента).
 * Не для legacy clientId === 'default'.
 */
export async function syncClientSettingsFromSheet(clientId: string): Promise<boolean> {
  if (!clientId || clientId === 'default') return false;

  const client = await getClientWithSettings(clientId);
  if (!client?.settings || !client.spreadsheetId?.trim()) return false;

  const sid = client.spreadsheetId.trim();

  try {
    const { settings, byKey } = await readSettingsWithKeyMap({ spreadsheetId: sid });
    const data = buildClientSettingsUpdateFromSheet(settings, byKey, client.settings);

    await prisma.clientSettings.update({
      where: { clientId },
      data,
    });

    const tg = kvGet(byKey, 'Telegram Channel ID', 'Channel ID');
    if (tg) {
      await prisma.client.update({
        where: { id: clientId },
        data: { telegramChannelId: tg },
      });
    }

    invalidateClientSettingsCache(clientId);
    logInfo('Sheet «Настройки» synced to DB', { clientId, spreadsheetId: sid });
    return true;
  } catch (e) {
    logWarn('syncClientSettingsFromSheet failed', {
      clientId,
      spreadsheetId: sid,
      error: serializeError(e).message,
    });
    return false;
  }
}
