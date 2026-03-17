/**
 * Извлечение настроек клиента (ДНК бренда) из текстовых ответов онбординга через LLM.
 */
import { config } from '../config';
import { isFetchUrlAllowed } from '../utils/urlAllowlist';
import { logWarn } from '../utils/logger';

const EXTRACT_PROMPT = `Ты — AI-ассистент, который извлекает настройки (ДНК бренда) из ответов клиента.
Ниже приведены ответы клиента на вопросы брифа (в виде расшифровки голоса и текста):

{ANSWERS}

Твоя задача — проанализировать эти ответы и вернуть ТОЛЬКО валидный JSON-объект со следующими полями:
- "dnaBrand" (строка): Краткое описание бренда, позиционирование, tone of voice.
- "productDetails" (строка): Основные продукты или услуги.
- "cta" (строка): Призыв к действию (Call to Action) для постов.
- "imageStyle" (строка): Пожелания по стилю картинок (например, "фотореализм, пастельные тона").
- "logoUrl" (строка или null): Если клиент дал ссылку на логотип, иначе null.

ВАЖНО: Верни ТОЛЬКО чистый JSON. Никакого маркдауна (без \`\`\`json), никаких вводных слов. Мы будем парсить этот ответ через JSON.parse().`;

export interface ExtractedClientSettings {
  dnaBrand: string;
  productDetails: string;
  cta: string;
  imageStyle: string;
  logoUrl: string | null;
}

/**
 * Из ответов клиента (расшифровки голоса/текст) извлечь структурированные настройки через OpenRouter.
 */
export async function extractClientSettings(answers: string[]): Promise<ExtractedClientSettings> {
  const answersText = answers.filter(Boolean).join('\n\n');
  const prompt = EXTRACT_PROMPT.replace('{ANSWERS}', answersText || '(нет ответов)');
  const body = {
    model: config.openrouter.textModel ?? 'google/gemini-2.5-flash',
    messages: [{ role: 'user' as const, content: prompt }],
    stream: false,
  };
  const timeoutMs = config.schedule.openrouterTimeoutMs ?? 120_000;
  const ac = new AbortController();
  const timeoutId = setTimeout(() => ac.abort(), timeoutMs);
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: ac.signal,
  });
  clearTimeout(timeoutId);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter extract failed: ${res.status} ${errText}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '{}';
  const withoutMarkdown = raw.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const firstBrace = withoutMarkdown.indexOf('{');
  const lastBrace = withoutMarkdown.lastIndexOf('}');
  const jsonSlice =
    firstBrace >= 0 && lastBrace > firstBrace
      ? withoutMarkdown.slice(firstBrace, lastBrace + 1)
      : withoutMarkdown;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonSlice) as Record<string, unknown>;
  } catch (parseErr) {
    logWarn('extractClientSettings: invalid JSON from LLM', { raw: raw.slice(0, 500), error: (parseErr as Error).message });
    return {
      dnaBrand: '',
      productDetails: '',
      cta: '',
      imageStyle: 'реалистичное фото',
      logoUrl: null,
    };
  }
  const logoUrlRaw = typeof parsed.logoUrl === 'string' ? parsed.logoUrl.trim() : null;
  const logoUrl = logoUrlRaw && logoUrlRaw !== '' && isFetchUrlAllowed(logoUrlRaw) ? logoUrlRaw : null;
  return {
    dnaBrand: String(parsed.dnaBrand ?? ''),
    productDetails: String(parsed.productDetails ?? ''),
    cta: String(parsed.cta ?? ''),
    imageStyle: String(parsed.imageStyle ?? 'реалистичное фото'),
    logoUrl,
  };
}

/** Маппинг callback_id форматов контента в строки для БД. */
const CONTENT_FORMAT_VALUES: Record<string, string> = {
  fmt_top10: 'ТОП-10 и полезные подборки',
  fmt_compare: 'Сравнения До/После',
  fmt_expert: 'Советы эксперта и разбор ошибок',
  fmt_custom: '',
};

export interface OnboardingSettingsForDb {
  role: string;
  contentTypes: string[];
  trustedSites: string[];
  productDetails: string;
  dnaBrand: string;
  cta: string;
  imageStyle: string;
  tonality: string;
  targetAudience: string;
  negativePrompt: string;
  operationMode: string;
  maxArticlesPerDay: number;
  publishIntervalMin: number;
  generationTime: string;
  imageGenMode: string;
  moderationEnabled: boolean;
  logoUrl?: string | null;
}

import type { OnboardingData } from '../redis/onboardingSession';

/**
 * Собирает имя клиента, нишу и настройки для БД из структурированных данных онбординга (inline-кнопки + свободный ввод).
 * Пресеты safe/turbo применяются здесь.
 */
export function extractClientSettingsFromData(data: OnboardingData): {
  clientName: string;
  niche: string;
  settings: OnboardingSettingsForDb;
} {
  const productDna = data.productDna ?? '';
  const clientName = productDna.slice(0, 80) || 'Клиент';
  const niche = productDna.slice(0, 200) || 'общее';

  const isTurbo = (data.operationMode ?? 'safe').toLowerCase() === 'turbo';
  const maxArticlesPerDay = isTurbo ? 15 : 5;
  const publishIntervalMin = isTurbo ? 10 : 60;
  const generationTime = isTurbo ? '' : '05:00';
  const imageGenMode = isTurbo ? 'immediate' : 'scheduled';

  const contentTypes = (data.contentTypes ?? [])
    .map((cb) => CONTENT_FORMAT_VALUES[cb] ?? cb)
    .filter(Boolean);

  return {
    clientName,
    niche,
    settings: {
      role: data.role ?? 'Эксперт',
      contentTypes,
      trustedSites: data.trustedSites ?? [],
      productDetails: data.productDetails ?? productDna,
      dnaBrand: data.productDna ?? productDna,
      cta: data.cta ?? 'Переходите по ссылке',
      imageStyle: data.imageStyle ?? 'реалистичное фото',
      tonality: data.tonality ?? '',
      targetAudience: data.targetAudience ?? '',
      negativePrompt: data.negativePrompt ?? '',
      operationMode: data.operationMode ?? 'safe',
      maxArticlesPerDay,
      publishIntervalMin,
      generationTime,
      imageGenMode,
      moderationEnabled: data.moderationEnabled ?? true,
      logoUrl: data.logoUrl ?? null,
    },
  };
}
