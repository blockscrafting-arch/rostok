/**
 * Сервис веб-онбординга: обработка POST /api/onboarding.
 * Собирает ответы (текст + расшифровка аудио), извлекает настройки через ИИ,
 * создаёт клиента в БД и разворачивает Google Таблицу.
 */
import { downloadAndConvertToMp3Base64, transcribeAudio } from '../telegram/media';
import { extractClientSettings } from '../ai/extractor';
import { provisionClient } from './clientProvisioning';
import { notifyNewBrief } from '../telegram/notifier';
import { logWarn, serializeError } from '../utils/logger';

export interface WebOnboardingInput {
  user: { name: string; email: string };
  answers: Array<{
    step: number;
    question: string;
    answer: string | null;
    audio: string | null;
  }>;
}

export interface WebOnboardingResult {
  clientId: string;
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
}

const SAFE_PRESET = {
  maxArticlesPerDay: 5,
  publishIntervalMin: 60,
  generationTime: '05:00',
  imageGenMode: 'scheduled' as const,
  moderationEnabled: true,
};

const TURBO_PRESET = {
  maxArticlesPerDay: 15,
  publishIntervalMin: 10,
  generationTime: '',
  imageGenMode: 'immediate' as const,
  moderationEnabled: true,
};

import { OnboardingValidationError } from './onboardingErrors';

/** Проверка, что URL аудио — полный https (http:// запрещён). */
function isValidAudioUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('https://') && url.length > 10;
}

/**
 * Обработать веб-онбординг: собрать ответы, расшифровать аудио, извлечь настройки, создать клиента.
 */
export async function processWebOnboarding(input: WebOnboardingInput): Promise<WebOnboardingResult> {
  const { user, answers } = input;
  const clientName = user.name.trim().slice(0, 80) || 'Клиент';
  const email = user.email.trim();
  const niche = clientName.slice(0, 200) || 'общее';

  const answerStrings: string[] = [];
  for (const item of answers) {
    let text = item.answer?.trim() ?? '';
    if (!text && item.audio) {
      if (!isValidAudioUrl(item.audio)) {
        throw new OnboardingValidationError(
          `Недопустимый URL аудио в шаге ${item.step}: требуется полный https://`
        );
      }
      try {
        const base64 = await downloadAndConvertToMp3Base64(item.audio);
        text = (await transcribeAudio(base64)) || '';
      } catch (e) {
        logWarn('Audio transcription failed', {
          step: item.step,
          url: item.audio.slice(0, 80),
          error: serializeError(e).message,
        });
        text = '[Ошибка расшифровки аудио: файл недоступен или повреждён]';
      }
    }
    if (!text && !item.answer && !item.audio) {
      continue;
    }
    const block = item.question?.trim()
      ? `Вопрос: ${item.question}\nОтвет: ${text}`
      : text;
    if (block) answerStrings.push(block);
  }

  if (answerStrings.length === 0) {
    throw new OnboardingValidationError(
      'Нет ни одного ответа для обработки. В каждом шаге должен быть answer или audio.'
    );
  }

  const extracted = await extractClientSettings(answerStrings);
  const dnaBrand = extracted.dnaBrand.trim() || clientName;
  const productDetails = extracted.productDetails.trim() || dnaBrand;
  const preset = extracted.operationMode === 'turbo' ? TURBO_PRESET : SAFE_PRESET;

  const result = await provisionClient({
    clientName,
    email,
    niche,
    settings: {
      role: extracted.role.trim() || 'Эксперт',
      contentTypes: extracted.contentTypes,
      trustedSites: extracted.trustedSites,
      productDetails,
      dnaBrand,
      cta: extracted.cta.trim() || 'Переходите по ссылке',
      imageStyle: extracted.imageStyle || 'реалистичное фото',
      tonality: extracted.tonality,
      targetAudience: extracted.targetAudience,
      negativePrompt: extracted.negativePrompt,
      operationMode: extracted.operationMode,
      maxArticlesPerDay: preset.maxArticlesPerDay,
      publishIntervalMin: preset.publishIntervalMin,
      generationTime: preset.generationTime,
      imageGenMode: preset.imageGenMode,
      moderationEnabled: preset.moderationEnabled,
      logoUrl: extracted.logoUrl,
    },
  });

  await notifyNewBrief(
    {
      clientId: result.clientId,
      clientName,
      email,
      niche,
      spreadsheetUrl: result.spreadsheetUrl,
    },
    'web'
  );

  return {
    clientId: result.clientId,
    spreadsheetId: result.spreadsheetId,
    spreadsheetUrl: result.spreadsheetUrl,
  };
}
