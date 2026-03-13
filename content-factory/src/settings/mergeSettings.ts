/**
 * Объединение настроек админа и клиента для мульти-клиента.
 * Мастер-промпты из AdminSettings подставляются через buildPrompt с контекстом клиента.
 */
import type { AdminSettings, Client, ClientSettings } from '@prisma/client';
import { buildPrompt } from '../prompts/builder';
import { config } from '../config';
import type { Settings } from '../types';

function defaultClientSettings(client: Client): Partial<ClientSettings> {
  return {
    role: 'Эксперт',
    contentTypes: [],
    trustedSites: [],
    dnaBrand: '',
    cta: '',
    imageStyle: 'реалистичное фото растения',
    maxArticlesPerDay: config.schedule.maxArticlesPerDay ?? 10,
    moderationEnabled: true,
    publishIntervalMin: 60,
    publishWindowStart: '',
    publishWindowEnd: '',
    dailySummaryTime: '21:00',
    generationTime: '05:00',
    imageGenMode: 'immediate',
    headlinesCount: 30,
  };
}

/**
 * Собирает Settings для пайплайнов из записей БД.
 * Если у клиента нет ClientSettings — используются значения по умолчанию и данные из Client.
 */
export function mergeSettings(
  admin: AdminSettings,
  client: Client,
  clientSettings: ClientSettings | null
): Settings {
  const s = clientSettings ?? (defaultClientSettings(client) as ClientSettings);
  const role = s.role ?? 'Эксперт';
  const niche = client.niche ?? '';
  const contentTypes = Array.isArray(s.contentTypes) ? s.contentTypes : [];
  const trustedSites = Array.isArray(s.trustedSites) ? s.trustedSites : [];
  const dnaBrand = s.dnaBrand ?? '';
  const cta = s.cta ?? '';
  const imageStyle = s.imageStyle ?? 'реалистичное фото растения';
  const headlineRules = admin.headlineRules ?? '';

  const promptContext = {
    role,
    niche,
    contentTypes,
    trustedSites,
    dnaBrand,
    cta,
    imageStyle,
    headlineRules,
  };

  const prompt1 = buildPrompt(admin.masterPrompt1, promptContext);
  const prompt2 = buildPrompt(admin.masterPrompt2, promptContext);
  const prompt3 = buildPrompt(admin.masterPrompt3, promptContext);
  const promptImage = buildPrompt(admin.masterPromptImage, promptContext);
  const promptImageWithReference = buildPrompt(admin.masterPromptImageRef, promptContext);

  const imageGenMode =
    (s.imageGenMode ?? 'immediate').toLowerCase() === 'scheduled' ? 'scheduled' : 'immediate';

  return {
    role,
    prompt1,
    prompt2,
    prompt3,
    promptImage,
    promptImageWithReference,
    dnaBrandUrl: '',
    catalogDocUrl: '',
    dnaBrandText: dnaBrand,
    catalogMap: {},
    referencePhotoMap: {},
    utmTemplate: s.utmTemplate ?? '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}',
    telegramChannelId:
      (client.telegramChannelId ?? config.telegram.channelId) || config.telegram.channelId,
    maxArticlesPerDay: Math.max(1, s.maxArticlesPerDay ?? 10),
    moderationEnabled: s.moderationEnabled ?? true,
    pollInterval: config.schedule.pollIntervalMs ?? 60_000,
    dailySummaryTime: (s.dailySummaryTime ?? '21:00').trim() || '21:00',
    generationTime: (s.generationTime ?? '05:00').trim() || '05:00',
    imageGenerationMode: imageGenMode,
    logoUrl: s.logoUrl ?? undefined,
    publishIntervalMin: Math.max(1, s.publishIntervalMin ?? 60),
    publishWindowStart: (s.publishWindowStart ?? '').trim(),
    publishWindowEnd: (s.publishWindowEnd ?? '').trim(),
    groundingModel: (s.groundingModel ?? admin.defaultGroundingModel) || undefined,
    textModel: (s.textModel ?? admin.defaultTextModel) || undefined,
    imageModel: (s.imageModel ?? admin.defaultImageModel) || undefined,
    headlinesCount: Math.max(1, s.headlinesCount ?? 30),
  };
}
