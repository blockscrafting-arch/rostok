/**
 * Seed для Контент-Завод 2.0: admin_settings (дефолтные шаблоны) + клиент default.
 * Реальные мастер-промпты заказчик вносит вручную после миграции.
 *
 * Клиент id=default — для FK cost_records и job с clientId "default" (legacy-одна таблица).
 *
 * Важно: повторный seed по умолчанию НЕ перезаписывает уже существующую строку default
 * (не трогаем isActive, ключи и таблицу основного заказчика).
 * Подтянуть поля из .env осознанно: SEED_SYNC_DEFAULT_CLIENT=1 (см. ниже).
 */
import 'dotenv/config';
import { PrismaClient, type Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_HEADLINES_PROMPT = `По ключевому слову "{keyword}" и НЧ-запросам: {keywords}.
{headline_rules}
Форматы контента для заголовков: {content_types}.
Сгенерируй {count} цепляющих заголовков статей.
Для каждого заголовка подбери 5-10 релевантных НЧ-запросов.
Формат ответа — строго:
1. [Заголовок]
КЗ: [запрос1, запрос2, ...]
(и так до {count})`;

const DEFAULT_DRAFT_PROMPT = `Ты — {role}.
Продукт/бизнес: {product_details}
Целевая аудитория: {target_audience}

Напиши экспертную SEO-статью строго на основе фактов из блока выше.
Используй доверенные источники: {trusted_sites}
Структура: заголовок (первая строка), вступление с крючком, 3-5 смысловых блоков с подзаголовками, заключение.
СТРОГО до 4000 символов. Чередуй длину предложений.
Оставь ДВА маркера [ССЫЛКА НА КАТАЛОГ]: один нативно в середине текста, второй в финальном блоке.`;

const DEFAULT_HUMANIZE_PROMPT = `Перепиши текст в стиле бренда.
Тональность: {tonality}
ДНК бренда: {dna_brand}

СТОП-СЛОВА И ЗАПРЕТЫ (не использовать ни в каком виде):
{negative_prompt}

ПРИЗЫВ К ДЕЙСТВИЮ — ОБЯЗАТЕЛЬНО вставь в ДВА места:
1) Нативно в середине текста, органично вписав в абзац: "{cta}" + маркер [ССЫЛКА НА КАТАЛОГ].
2) В самом конце статьи выделенным блоком: "{cta}" + маркер [ССЫЛКА НА КАТАЛОГ].

Итоговый текст СТРОГО до 4000 символов.
Не изменяй первую строку — это заголовок.`;

const DEFAULT_IMAGE_PROMPT = `Сгенерируй изображение для статьи.
Стиль: {image_style}
Тема: {headline}
Контекст статьи: {text}
Требования: уникальное изображение, высокое качество, без текста на картинке (если стиль не "инфографика" или "журнальная обложка").`;
const DEFAULT_IMAGE_REF_PROMPT =
  'Reference photo of the subject. Generate a new image in style {image_style}, similar appearance. Subject: {headline}.';

const DEFAULT_GROUNDING_PROMPT = `Собери проверенные факты для статьи.
Заголовок: "{headline}"
Ключевые слова: {keywords}
Верни только проверенные данные. Источники укажи списком URL.`;

const HEADLINE_RULES = `Ключевое слово должно быть в КЗ, если заголовок его упоминает. Разные заголовки — разные подмножества КЗ.`;

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  return v || undefined;
}

/** Первый chat_id из TELEGRAM_NOTIFY_CHAT_ID (список через запятую). */
function firstNotifyChatId(): string | undefined {
  const raw = envTrim('TELEGRAM_NOTIFY_CHAT_ID');
  if (!raw) return undefined;
  const first = raw.split(',')[0]?.trim();
  return first || undefined;
}

async function main() {
  await prisma.adminSettings.upsert({
    where: { id: 'global' },
    create: {
      id: 'global',
      masterPrompt1: DEFAULT_HEADLINES_PROMPT,
      masterPrompt2: DEFAULT_DRAFT_PROMPT,
      masterPrompt3: DEFAULT_HUMANIZE_PROMPT,
      masterPromptImage: DEFAULT_IMAGE_PROMPT,
      masterPromptImageRef: DEFAULT_IMAGE_REF_PROMPT,
      masterPromptGrounding: DEFAULT_GROUNDING_PROMPT,
      headlineRules: HEADLINE_RULES,
      defaultTextModel: 'deepseek/deepseek-chat',
      defaultImageModel: 'google/gemini-3.1-flash-image-preview',
      defaultGroundingModel: 'perplexity/sonar',
      updatedAt: new Date(),
    },
    update: {
      masterPrompt1: DEFAULT_HEADLINES_PROMPT,
      masterPrompt2: DEFAULT_DRAFT_PROMPT,
      masterPrompt3: DEFAULT_HUMANIZE_PROMPT,
      masterPromptImage: DEFAULT_IMAGE_PROMPT,
      masterPromptImageRef: DEFAULT_IMAGE_REF_PROMPT,
      masterPromptGrounding: DEFAULT_GROUNDING_PROMPT,
      headlineRules: HEADLINE_RULES,
      updatedAt: new Date(),
    },
  });

  // Только если строки ещё нет (новый стенд). isActive=false — включать вручную в NocoDB/SQL при необходимости.
  await prisma.client.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      name: 'Основной',
      niche: 'legacy',
      openrouterApiKey: envTrim('OPENROUTER_API_KEY') ?? 'legacy-placeholder',
      spreadsheetId: envTrim('SPREADSHEET_ID') ?? null,
      telegramChannelId: envTrim('TELEGRAM_CHANNEL_ID') ?? null,
      notifyChatId: firstNotifyChatId() ?? null,
      isActive: false,
      onboardingDone: true,
    },
    update: {},
  });

  // Явное решение оператора: обновить default из .env (не запускать в CI без нужды).
  if (envTrim('SEED_SYNC_DEFAULT_CLIENT') === '1') {
    const data: Prisma.ClientUpdateInput = {};
    if (process.env.SPREADSHEET_ID !== undefined) {
      data.spreadsheetId = envTrim('SPREADSHEET_ID') ?? null;
    }
    if (process.env.OPENROUTER_API_KEY !== undefined) {
      data.openrouterApiKey = envTrim('OPENROUTER_API_KEY') ?? 'legacy-placeholder';
    }
    if (process.env.TELEGRAM_CHANNEL_ID !== undefined) {
      data.telegramChannelId = envTrim('TELEGRAM_CHANNEL_ID') ?? null;
    }
    if (process.env.TELEGRAM_NOTIFY_CHAT_ID !== undefined) {
      data.notifyChatId = firstNotifyChatId() ?? null;
    }
    if (Object.keys(data).length > 0) {
      await prisma.client.update({ where: { id: 'default' }, data });
    }
    const act = envTrim('SEED_DEFAULT_CLIENT_ACTIVE');
    if (act === '1' || act === 'true') {
      await prisma.client.update({ where: { id: 'default' }, data: { isActive: true } });
    }
    if (act === '0' || act === 'false') {
      await prisma.client.update({ where: { id: 'default' }, data: { isActive: false } });
    }
    console.log('Seed: client default обновлён из .env (SEED_SYNC_DEFAULT_CLIENT=1)');
  }

  console.log('Seed: admin_settings + default client OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
