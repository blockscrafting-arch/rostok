/**
 * Seed для Контент-Завод 2.0: admin_settings (дефолтные шаблоны) + onboarding_steps (заглушки file_id).
 * Реальные мастер-промпты заказчик вносит вручную после миграции.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_HEADLINES_PROMPT = `По ключевому слову "{keyword}" и НЧ-запросам: {keywords}.
Сгенерируй {count} заголовков статей (лаконичные, с пользой для читателя).
Для каждого заголовка подбери свой набор из 5–10 релевантных НЧ-запросов.
Формат ответа — строго:
1. [Заголовок]
КЗ: [запрос1, запрос2, ...]
(и так до {count})`;

const DEFAULT_DRAFT_PROMPT = `Ты — {role}. Пиши экспертную статью. Используй только проверенные факты из блока выше. СТРОГО до 4000 символов. Чередуй длину предложений.`;

const DEFAULT_HUMANIZE_PROMPT = `Перепиши текст в стиле бренда, сохрани смысл. Итоговый текст СТРОГО до 4000 символов. Не изменяй первую строку — это заголовок. Стиль живого эксперта: чередуй длину предложений, избегай шаблонов.`;

const DEFAULT_IMAGE_PROMPT =
  'Photorealistic photo of {headline}, natural lighting, high quality, smartphone photo style.';
const DEFAULT_IMAGE_REF_PROMPT =
  'Reference photo of the subject. Generate a new photorealistic image, similar style. Subject: {headline}.';

const DEFAULT_GROUNDING_PROMPT = `Собери проверенные факты для статьи.
Заголовок: "{headline}"
Ключевые слова: {keywords}
Верни только проверенные данные. Источники укажи списком URL.`;

const HEADLINE_RULES = `Ключевое слово должно быть в КЗ, если заголовок его упоминает. Разные заголовки — разные подмножества КЗ.`;

const ONBOARDING_STEPS = [
  { stepOrder: 1, description: 'Знакомство: название компании и ниша' },
  { stepOrder: 2, description: 'Роль эксперта и типы контента' },
  { stepOrder: 3, description: 'Источники фактов и особенности продукта' },
  { stepOrder: 4, description: 'Голос бренда и призыв к действию' },
  { stepOrder: 5, description: 'Стиль картинок и логотип' },
  { stepOrder: 6, description: 'Подтверждение сводки' },
];

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

  for (const step of ONBOARDING_STEPS) {
    const existing = await prisma.onboardingStep.findFirst({
      where: { stepOrder: step.stepOrder },
    });
    if (!existing) {
      await prisma.onboardingStep.create({
        data: {
          stepOrder: step.stepOrder,
          description: step.description,
          fileId: '',
          fileType: 'video_note',
        },
      });
    }
  }

  console.log('Seed: admin_settings + onboarding_steps OK');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
