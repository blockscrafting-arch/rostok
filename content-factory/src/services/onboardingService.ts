/**
 * Сервис веб-онбординга: обработка POST /api/onboarding.
 * Собирает ответы (текст + расшифровка аудио), извлекает настройки через ИИ,
 * создаёт клиента в БД и разворачивает Google Таблицу.
 */
import { downloadAndConvertToMp3Base64, transcribeAudio } from '../telegram/media';
import { extractClientSettings } from '../ai/extractor';
import { provisionClient } from './clientProvisioning';
import { notifyNewBrief } from '../telegram/notifier';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import { processAndPersistOnboardingLogo } from '../utils/logoProcessor';

export interface WebOnboardingInput {
  user: { name: string; email: string };
  answers: Array<{
    step: number;
    question: string;
    answer: string | null;
    audio: string | null;
  }>;
  telegramChannelId?: string;
  telegramBotToken?: string;
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
  const t0 = Date.now();
  const { user, answers } = input;
  const clientName = user.name.trim().slice(0, 80) || 'Клиент';
  const email = user.email.trim();

  const totalAnswers = answers.length;
  const audioCount = answers.filter((a) => a.audio && !a.answer?.trim()).length;
  const textCount = answers.filter((a) => a.answer?.trim()).length;

  logInfo('Onboarding started', { clientName, email, totalAnswers, textCount, audioCount });

  const answerStrings: string[] = [];
  let audioOk = 0;
  let audioFail = 0;
  let skipped = 0;

  for (const item of answers) {
    let text = item.answer?.trim() ?? '';
    if (text && item.audio) {
      logInfo('Audio ignored: text answer takes priority', { step: item.step });
    }
    if (!text && item.audio) {
      if (!isValidAudioUrl(item.audio)) {
        throw new OnboardingValidationError(
          `Недопустимый URL аудио в шаге ${item.step}: требуется полный https://`
        );
      }
      logInfo('Audio download started', { step: item.step, url: item.audio.slice(0, 80) });
      try {
        const base64 = await downloadAndConvertToMp3Base64(item.audio);
        text = (await transcribeAudio(base64)) || '';
        if (text) {
          audioOk++;
          logInfo('Audio transcribed', { step: item.step, chars: text.length });
        } else {
          audioFail++;
          logWarn('Audio transcribed but empty result', { step: item.step });
        }
      } catch (e) {
        audioFail++;
        logWarn('Audio transcription failed', {
          step: item.step,
          url: item.audio.slice(0, 80),
          error: serializeError(e).message,
        });
        text = '[Ошибка расшифровки аудио: файл недоступен или повреждён]';
      }
    }
    if (!text && !item.answer && !item.audio) {
      skipped++;
      continue;
    }
    if (text) {
      const source = item.audio && !item.answer?.trim() ? 'audio' : 'text';
      logInfo('Step answer collected', {
        step: item.step,
        source,
        chars: text.length,
        preview: text.slice(0, 200),
      });
    }
    const block = item.question?.trim()
      ? `Вопрос: ${item.question}\nОтвет: ${text}`
      : text;
    if (block) answerStrings.push(block);
  }

  logInfo('Answers processed', {
    clientName,
    total: totalAnswers,
    collected: answerStrings.length,
    audioOk,
    audioFail,
    skipped,
    elapsedMs: Date.now() - t0,
  });

  if (answerStrings.length === 0) {
    throw new OnboardingValidationError(
      'Нет ни одного ответа для обработки. В каждом шаге должен быть answer или audio.'
    );
  }

  logInfo('Sending to extractor', {
    blocks: answerStrings.length,
    totalChars: answerStrings.join('').length,
    blocks_preview: answerStrings.map((s, i) => ({ i, preview: s.slice(0, 150) })),
  });

  const extracted = await extractClientSettings(answerStrings);

  logInfo('AI extraction done', {
    clientName,
    role: extracted.role.slice(0, 80),
    tonality: extracted.tonality.slice(0, 80),
    targetAudience: extracted.targetAudience.slice(0, 80),
    productDetails: extracted.productDetails.slice(0, 80),
    contentTypes: extracted.contentTypes,
    operationMode: extracted.operationMode,
    trustedSites: extracted.trustedSites.length,
    elapsedMs: Date.now() - t0,
  });

  const niche = extracted.niche || 'Не указано';
  const dnaBrand = extracted.dnaBrand.trim() || clientName;
  const productDetails = extracted.productDetails.trim() || dnaBrand;
  const preset = extracted.operationMode === 'turbo' ? TURBO_PRESET : SAFE_PRESET;

  const result = await provisionClient({
    clientName,
    email,
    niche,
    telegramChannelId: input.telegramChannelId,
    telegramBotToken: input.telegramBotToken,
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
      telegramChannelId: input.telegramChannelId ?? null,
    },
  });

  logInfo('Client provisioned', {
    clientId: result.clientId,
    clientName,
    spreadsheetId: result.spreadsheetId ?? 'none',
    hasSpreadsheet: !!result.spreadsheetUrl,
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

  logInfo('Onboarding completed', {
    clientId: result.clientId,
    clientName,
    totalAnswers,
    audioOk,
    audioFail,
    elapsedMs: Date.now() - t0,
  });

  void processAndPersistOnboardingLogo(result.clientId, extracted.logoUrl, result.spreadsheetId);

  return {
    clientId: result.clientId,
    spreadsheetId: result.spreadsheetId,
    spreadsheetUrl: result.spreadsheetUrl,
  };
}
