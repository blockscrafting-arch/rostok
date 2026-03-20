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
- "dnaBrand" (строка, max 500): Краткое описание бренда, позиционирование, tone of voice.
- "productDetails" (строка, max 500): Основные продукты или услуги.
- "role" (строка, max 200): Роль ИИ / от чьего лица пишем (например «Ты — прораб с 20-летним стажем»). Если неясно — «Эксперт».
- "cta" (строка, max 200): Призыв к действию для постов.
- "imageStyle" (строка, max 500): Стиль картинок (например «фотореализм, пастельные тона»).
- "tonality" (строка, max 500): Тональность и стиль речи (официальный, дружелюбный и т.д.).
- "targetAudience" (строка, max 500): Целевая аудитория.
- "negativePrompt" (строка, max 500): Чего избегать в текстах (стоп-темы, запреты, стоп-слова одной строкой).
- "contentTypes" (массив строк, до 15): Форматы контента (короткие подписи, например «ТОП-10», «советы эксперта»). Пустой массив, если не сказано.
- "trustedSites" (массив строк URL https, до 10): Сайты и источники для контекста. Только полные https-URL; иначе опусти.
- "operationMode" (строка "safe" или "turbo"): Режим автопилота — turbo если клиент явно выбрал агрессивный/ускоренный режим, иначе safe.
- "logoUrl" (строка или null): Только URL логотипа (https, PNG/JPEG), иначе null.

ВАЖНО: Верни ТОЛЬКО чистый JSON. Никакого маркдауна (без \`\`\`json), никаких вводных слов. Мы будем парсить этот ответ через JSON.parse().`;

export interface ExtractedClientSettings {
  dnaBrand: string;
  productDetails: string;
  role: string;
  cta: string;
  imageStyle: string;
  tonality: string;
  targetAudience: string;
  negativePrompt: string;
  contentTypes: string[];
  trustedSites: string[];
  /** safe = пресет по умолчанию; turbo = больше статей, быстрее интервал публикации. */
  operationMode: 'safe' | 'turbo';
  logoUrl: string | null;
}

function emptyExtracted(): ExtractedClientSettings {
  return {
    dnaBrand: '',
    productDetails: '',
    role: '',
    cta: '',
    imageStyle: 'реалистичное фото',
    tonality: '',
    targetAudience: '',
    negativePrompt: '',
    contentTypes: [],
    trustedSites: [],
    operationMode: 'safe',
    logoUrl: null,
  };
}

function normalizeStringArray(value: unknown, maxItems: number, maxItemLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    .map((s) => s.trim().slice(0, maxItemLen))
    .slice(0, maxItems);
}

/** Доверенные сайты: только https, без очевидных локальных/частных hostname в строке. */
function normalizeTrustedSites(value: unknown): string[] {
  const raw = normalizeStringArray(value, 10, 2048);
  return raw.filter((s) => {
    try {
      const u = new URL(s);
      if (u.protocol !== 'https:') return false;
      const h = u.hostname.toLowerCase();
      if (
        h === 'localhost' ||
        h === '127.0.0.1' ||
        h === '0.0.0.0' ||
        h === '::1' ||
        h.startsWith('192.168.') ||
        h.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
        h.startsWith('169.254.')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });
}

function normalizeOperationMode(value: unknown): 'safe' | 'turbo' {
  const s = String(value ?? '').toLowerCase().trim();
  if (s === 'turbo' || s.includes('турбо')) return 'turbo';
  return 'safe';
}

/**
 * Из ответов клиента (расшифровки голоса/текст) извлечь структурированные настройки через OpenRouter.
 */
const MAX_ANSWERS_CHARS = 8000; // Ограничение входа в промпт (защита от prompt injection)

export async function extractClientSettings(answers: string[]): Promise<ExtractedClientSettings> {
  const joined = answers.filter(Boolean).join('\n\n');
  const answersText = joined.length > MAX_ANSWERS_CHARS ? joined.slice(0, MAX_ANSWERS_CHARS) + '...[обрезано]' : joined;
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
    logWarn('extractClientSettings: invalid JSON from LLM', {
      context: 'web_onboarding',
      raw: raw.slice(0, 500),
      error: (parseErr as Error).message,
    });
    return emptyExtracted();
  }
  const logoUrlRaw = typeof parsed.logoUrl === 'string' ? parsed.logoUrl.trim() : null;
  const logoUrl = logoUrlRaw && logoUrlRaw !== '' && isFetchUrlAllowed(logoUrlRaw) ? logoUrlRaw : null;

  // Post-LLM validation: ограничение длины полей (защита от prompt injection)
  const MAX_FIELD = 500;
  const MAX_ROLE = 200;
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
  const roleTrim = truncate(String(parsed.role ?? ''), MAX_ROLE).trim();
  const imageStyleRaw = truncate(String(parsed.imageStyle ?? 'реалистичное фото'), MAX_FIELD);
  return {
    dnaBrand: truncate(String(parsed.dnaBrand ?? ''), MAX_FIELD),
    productDetails: truncate(String(parsed.productDetails ?? ''), MAX_FIELD),
    role: roleTrim || 'Эксперт',
    cta: truncate(String(parsed.cta ?? ''), 200),
    imageStyle: imageStyleRaw || 'реалистичное фото',
    tonality: truncate(String(parsed.tonality ?? ''), MAX_FIELD),
    targetAudience: truncate(String(parsed.targetAudience ?? ''), MAX_FIELD),
    negativePrompt: truncate(String(parsed.negativePrompt ?? ''), MAX_FIELD),
    contentTypes: normalizeStringArray(parsed.contentTypes, 15, 120),
    trustedSites: normalizeTrustedSites(parsed.trustedSites),
    operationMode: normalizeOperationMode(parsed.operationMode),
    logoUrl,
  };
}
