/**
 * Полный путь POST /api/onboarding без мока onboardingService:
 * реальный processWebOnboarding, моки только ИИ, БД/провижининг, Telegram, медиа.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import bearerAuth from '@fastify/bearer-auth';
import rateLimit from '@fastify/rate-limit';

const hoisted = vi.hoisted(() => {
  const provisionResult = {
    clientId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    spreadsheetId: '1fullMockSpreadsheetIdXXXXXXXXXXXX',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/1fullMockSpreadsheetIdXXXXXXXXXXXX/edit',
  };

  const extractedSafe = {
    dnaBrand: 'Питомник «Розовый сад»',
    productDetails: 'Саженцы роз, удобрения, консультации по уходу',
    role: 'Агроном-консультант',
    cta: 'Переходите в каталог на сайте',
    imageStyle: 'естественное фото растений',
    tonality: 'дружелюбный экспертный',
    targetAudience: 'дачники и любители роз 35–60 лет',
    negativePrompt: 'без агрессивных ценников',
    contentTypes: ['ТОП-10', 'инструкции', 'обзоры'],
    trustedSites: ['https://example.com/roses', 'https://wikihow.com'],
    operationMode: 'safe' as const,
    logoUrl: null as string | null,
  };

  return {
    provisionClient: vi.fn().mockResolvedValue(provisionResult),
    extractClientSettings: vi.fn().mockResolvedValue(extractedSafe),
    notifyNewBrief: vi.fn().mockResolvedValue(undefined),
    downloadAndConvertToMp3Base64: vi.fn(),
    transcribeAudio: vi.fn(),
    provisionResult,
    extractedSafe,
  };
});

vi.mock('../../services/clientProvisioning', () => ({
  provisionClient: hoisted.provisionClient,
}));

vi.mock('../../ai/extractor', () => ({
  extractClientSettings: hoisted.extractClientSettings,
}));

vi.mock('../../telegram/notifier', () => ({
  notifyNewBrief: hoisted.notifyNewBrief,
}));

vi.mock('../../telegram/media', () => ({
  downloadAndConvertToMp3Base64: hoisted.downloadAndConvertToMp3Base64,
  transcribeAudio: hoisted.transcribeAudio,
}));

import { onboardingRoute } from './onboarding';

const SECRET = 'full-flow-secret-xyz';

async function buildApp() {
  const app = Fastify({
    logger: false,
    ajv: {
      plugins: [require('ajv-formats')],
    },
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(bearerAuth, {
    keys: new Set([SECRET]),
    errorResponse: () => ({ ok: false, error: 'Invalid API secret' }),
  });
  await app.register(onboardingRoute);
  return app;
}

/** Реалистичное тело, близкое к прод-онбордингу (несколько шагов, кириллица). */
function fullOnboardingPayload() {
  return {
    user: {
      name: 'ООО Розовый сад',
      email: 'manager@roses.example.com',
    },
    answers: [
      {
        step: 1,
        question: 'Расскажите о продукте и услугах',
        answer:
          'Мы продаём саженцы роз 200+ сортов, доставка по России. Есть консультации по посадке и обрезке.',
        audio: null,
      },
      {
        step: 2,
        question: 'Кто ваша целевая аудитория?',
        answer: 'Владельцы частных домов и дач, любители цветов, начинающие садоводы.',
        audio: null,
      },
      {
        step: 3,
        question: 'Какой тон общения предпочитаете?',
        answer: 'Тёплый, как у знакомого садовода, но с фактами и ссылками на источники.',
        audio: null,
      },
      {
        step: 4,
        question: 'Дополнительно',
        answer: null,
        audio: null,
      },
    ],
  };
}

describe('POST /api/onboarding полный запрос (реальный сервис, моки внешних API)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.provisionClient.mockResolvedValue(hoisted.provisionResult);
    hoisted.extractClientSettings.mockResolvedValue(hoisted.extractedSafe);
  });

  it('201, тело ответа и вызов extractClientSettings + provisionClient + notify', async () => {
    const payload = fullOnboardingPayload();

    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      clientId: string;
      spreadsheetId: string | null;
      spreadsheetUrl: string | null;
    };

    expect(body.ok).toBe(true);
    expect(body.clientId).toBe(hoisted.provisionResult.clientId);
    expect(body.spreadsheetId).toBe(hoisted.provisionResult.spreadsheetId);
    expect(body.spreadsheetUrl).toBe(hoisted.provisionResult.spreadsheetUrl);
    expect(body.clientId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );

    expect(hoisted.extractClientSettings).toHaveBeenCalledTimes(1);
    const extractArg = hoisted.extractClientSettings.mock.calls[0][0] as string[];
    expect(Array.isArray(extractArg)).toBe(true);
    expect(extractArg.length).toBeGreaterThanOrEqual(3);
    expect(extractArg.some((s) => s.includes('саженцы') || s.includes('роз'))).toBe(true);
    expect(extractArg.some((s) => s.includes('аудитор'))).toBe(true);

    expect(hoisted.provisionClient).toHaveBeenCalledTimes(1);
    const provisionInput = hoisted.provisionClient.mock.calls[0][0] as {
      clientName: string;
      email: string;
      niche: string;
      settings: { operationMode: string; maxArticlesPerDay: number; imageGenMode: string };
    };
    expect(provisionInput.clientName).toBe('ООО Розовый сад');
    expect(provisionInput.email).toBe('manager@roses.example.com');
    expect(provisionInput.niche).toBe('ООО Розовый сад');
    expect(provisionInput.settings.operationMode).toBe('safe');
    expect(provisionInput.settings.maxArticlesPerDay).toBe(5);
    expect(provisionInput.settings.imageGenMode).toBe('scheduled');

    expect(hoisted.notifyNewBrief).toHaveBeenCalledWith(
      {
        clientId: hoisted.provisionResult.clientId,
        clientName: 'ООО Розовый сад',
        email: 'manager@roses.example.com',
        niche: 'ООО Розовый сад',
        spreadsheetUrl: hoisted.provisionResult.spreadsheetUrl,
      },
      'web'
    );

    expect(hoisted.downloadAndConvertToMp3Base64).not.toHaveBeenCalled();
    expect(hoisted.transcribeAudio).not.toHaveBeenCalled();
  });

  it('turbo: provision получает turbo-пресет при operationMode turbo в экстракторе', async () => {
    hoisted.extractClientSettings.mockResolvedValueOnce({
      ...hoisted.extractedSafe,
      operationMode: 'turbo' as const,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/onboarding',
      headers: { authorization: `Bearer ${SECRET}` },
      payload: fullOnboardingPayload(),
    });

    expect(res.statusCode).toBe(201);
    const provisionInput = hoisted.provisionClient.mock.calls[0][0] as {
      settings: { maxArticlesPerDay: number; publishIntervalMin: number; imageGenMode: string };
    };
    expect(provisionInput.settings.maxArticlesPerDay).toBe(15);
    expect(provisionInput.settings.publishIntervalMin).toBe(10);
    expect(provisionInput.settings.imageGenMode).toBe('immediate');
  });
});
