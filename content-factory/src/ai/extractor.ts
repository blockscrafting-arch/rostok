/**
 * Извлечение настроек клиента (ДНК бренда) из текстовых ответов онбординга через LLM.
 */
import { config } from '../config';
import { isFetchUrlAllowed } from '../utils/urlAllowlist';
import { logWarn } from '../utils/logger';

const EXTRACT_PROMPT = `Ты — AI-ассистент, который извлекает настройки (ДНК бренда) из ответов клиента на вопросы онбординга.

Ниже приведены ответы клиента (текст и/или расшифровка голосовых сообщений) С НОМЕРОМ КАЖДОГО ШАГА:

{ANSWERS}

ГЛАВНЫЕ ПРАВИЛА:
1. СНАЧАЛА СОХРАНИ ДОСЛОВНО то, что клиент написал или сказал. Потом можешь дополнить и структурировать, но НИКОГДА не заменяй и не теряй оригинальные слова клиента.
2. НЕ СЖИМАЙ и НЕ ОБОБЩАЙ. Если клиент сказал 5 предложений — в поле должно быть 5 предложений, а не одно обобщение.
3. Если клиент указал конкретные цифры (возраст, пол, количество) — они ОБЯЗАТЕЛЬНО должны быть в результате.
4. Если в ЛЮБОМ шаге клиент упоминает пол, возраст или демографию аудитории — включи это в "targetAudience", даже если это сказано не на шаге 2.
5. ФИЛЬТРАЦИЯ ПЛЕЙСХОЛДЕРОВ: если ответ на шаг содержит ТОЛЬКО ярлык варианта из интерфейса (например: «⬇ Свой призыв (Надиктовать)», «Свой стиль (Написать/Надиктовать)», «Своя аудитория (Голосом/Текстом)», «Свой стиль (Надиктован голосом)» и т.п. с ключевыми словами «Надиктовать», «Написать», «Голосом», «Текстом» в скобках) — это НЕ реальный ответ клиента, а заглушка интерфейса. Считай шаг ПРОПУЩЕННЫМ и используй fallback-значение. НЕ включай текст заглушки в результат. Если после заглушки есть реальный текст клиента — используй только реальный текст.

Проанализируй каждый шаг и верни ТОЛЬКО валидный JSON-объект со следующими полями:

ШАГ 1 → "tonality" (строка, до 1000 символов)
Голос бренда / тональность.
— Если клиент выбрал вариант (например «Официально-деловой») — расшифруй, что это значит: на «Вы», сдержанно, факты без эмоций, профессиональная лексика.
— Если клиент надиктовал аудио — учти особенности его речи: обращения, паттерны, характерные слова, манеру общения. Опиши их подробно.
— Если указал и вариант, и аудио — объедини: выбранный стиль + уточнения из голоса.
— Если не указано — «Дружелюбный экспертный».

ШАГ 2 → "targetAudience" (строка, до 1000 символов)
Целевая аудитория.
— ПЕРВЫМ ДЕЛОМ: сохрани дословно то, что клиент ответил (пол, возраст, описание). Если клиент сказал «только женщины 50+» — именно это и должно быть в начале поля.
— Затем структурируй: возраст, пол, интересы, боли/проблемы, уровень дохода, география (если сказано).
— Если клиент назвал кратко (например «Мамочки») — сохрани оригинал И дополни: кто они, чего хотят, какие у них боли. Но НЕ заменяй оригинал своим расширенным описанием.
— Дополнительно просмотри ВСЕ остальные шаги — если клиент где-то ещё упоминал аудиторию, возраст, пол — добавь сюда.
— Если клиент НЕ назвал подробности — проанализируй ответ из шага 3 (продукт) и составь портрет аудитории на его основе.
— Если невозможно определить — «Не указано, требует уточнения».

ШАГ 3 → "niche" (строка, до 100 символов) + "dnaBrand" (строка, до 1500 символов) + "productDetails" (строка, до 1500 символов)
О продукте и бренде. ЭТО САМЫЙ ВАЖНЫЙ ШАГ — здесь клиент часто надиктовывает много деталей.

"niche" — Ниша / сфера деятельности:
— Коротко: в какой отрасли работает клиент (например: «Питомник декоративных растений», «IT-консалтинг», «Детская одежда», «Стоматология»).
— Максимум 3-5 слов. НЕ имя клиента, НЕ бренд — именно сфера бизнеса.
— Если невозможно определить — «Не указано».

"dnaBrand" — ДНК бренда:
— Краткое описание бренда, позиционирование, уникальность, tone of voice.
— Название компании / бренда.
— Ценности компании, миссия (если сказано).
— Чем отличаются от конкурентов.

"productDetails" — Детали продукта/услуги:
— Что именно продают/делают (перечислить конкретно, не обобщать).
— Локация / география работы.
— Технология производства, особенности процесса.
— Преимущества продукта, плюсы (и минусы, если клиент упомянул).
— Почему стоит покупать у них.
— Ценовой сегмент (если упомянут).
— Каждый отдельный факт — отдельной строкой.
— Если параметр не назван — пиши «Не указано».
— Если клиент добавил что-то вне списка выше — тоже выведи отдельной строкой.

ШАГ 4 → "imageStyle" (строка, до 500 символов)
Стиль изображений.
— Если выбран пресет — расшифруй: «фотореализм», «flat-иллюстрация», «акварель» и т.д.
— Если клиент описал словами — сохрани описание дословно, добавь технические подробности для промпта генерации.
— Если не указано — «Реалистичное фото высокого качества».

ШАГ 5 → "contentTypes" (массив строк, до 15 элементов)
Форматы контента.
— Каждый формат — отдельным элементом массива (например: «ТОП-10», «Советы эксперта», «Ньюсджекинг»).
— Если клиент надиктовал свой формат — включи описание как есть.
— Если не указано — пустой массив [].

ШАГ 6 → "trustedSites" (массив строк URL, до 10)
Сайты и источники.
— Только полные URL начинающиеся с https://.
— Если клиент назвал домен без протокола (например «мойсайт.ру») — добавь https://.
— Если нет URL — пустой массив [].

ШАГ 7 → "role" (строка, до 300 символов)
От чьего лица пишем.
— Создай полноценную ролевую установку: «Ты — [профессия] с [опытом], специализируешься на [область]».
— Если клиент сказал кратко («продавец») — раскрой на основе контекста из шага 3.
— Если не указано — «Эксперт в своей области».

ШАГ 8 → "negativePrompt" (строка, до 500 символов)
Стоп-слова и запреты.
— Перечисли через запятую все ограничения: темы-табу, запрещённые слова, стоп-форматы.
— Расшифруй коды если они встречаются: «no_prices» → «не указывать цены», «no_diminutive» → «не использовать уменьшительно-ласкательные», «no_guarantee» → «не давать гарантий и обещаний».
— Если не указано — пустая строка.

ШАГ 9 → "operationMode" (строка: "safe" или "turbo")
— "turbo" только если клиент ЯВНО выбрал агрессивный/ускоренный режим.
— Во всех остальных случаях — "safe".

ШАГ 10 → "cta" (строка, до 200 символов)
Призыв к действию.
— Если выбран пресет — расшифруй: «Консультация» → «Запишитесь на бесплатную консультацию».
— Если свой текст — сохрани как есть.
— Если не указано — «Переходите по ссылке».

Дополнительное поле (определи из ЛЮБОГО шага, если встретится):
— "logoUrl" (строка или null): URL логотипа (https, PNG/JPEG). Если не найден — null.

ВАЖНО:
1. Верни ТОЛЬКО чистый JSON. Никакого маркдауна, никаких вводных слов. Парсим через JSON.parse().
2. НЕ СЖИМАЙ ответы. Лучше длинное подробное поле, чем короткое обобщение.
3. Если шаг пропущен (нет ответа) — используй fallback-значение, указанное выше.
4. Если информация из одного шага дополняет другой — используй её (например, шаг 3 может помочь заполнить targetAudience из шага 2).`;

export interface ExtractedClientSettings {
  niche: string;
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
    niche: '',
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

  const MAX_LONG = 1500;
  const MAX_MID = 1000;
  const MAX_SHORT = 500;
  const MAX_ROLE = 300;
  const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);
  const roleTrim = truncate(String(parsed.role ?? ''), MAX_ROLE).trim();
  const imageStyleRaw = truncate(String(parsed.imageStyle ?? 'реалистичное фото'), MAX_SHORT);
  return {
    niche: truncate(String(parsed.niche ?? ''), 100).trim(),
    dnaBrand: truncate(String(parsed.dnaBrand ?? ''), MAX_LONG),
    productDetails: truncate(String(parsed.productDetails ?? ''), MAX_LONG),
    role: roleTrim || 'Эксперт',
    cta: truncate(String(parsed.cta ?? ''), 200),
    imageStyle: imageStyleRaw || 'реалистичное фото',
    tonality: truncate(String(parsed.tonality ?? ''), MAX_MID),
    targetAudience: truncate(String(parsed.targetAudience ?? ''), MAX_MID),
    negativePrompt: truncate(String(parsed.negativePrompt ?? ''), MAX_SHORT),
    contentTypes: normalizeStringArray(parsed.contentTypes, 15, 200),
    trustedSites: normalizeTrustedSites(parsed.trustedSites),
    operationMode: normalizeOperationMode(parsed.operationMode),
    logoUrl,
  };
}
