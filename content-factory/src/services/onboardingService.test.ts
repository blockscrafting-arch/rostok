import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processWebOnboarding } from './onboardingService';

vi.mock('./clientProvisioning', () => ({
  provisionClient: vi.fn().mockResolvedValue({
    clientId: 'client-123',
    spreadsheetId: 'sheet-123',
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit',
  }),
}));

vi.mock('../telegram/notifier', () => ({
  notifyNewBrief: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../telegram/media', () => ({
  downloadAndConvertToMp3Base64: vi.fn().mockResolvedValue('base64mock'),
  transcribeAudio: vi.fn().mockResolvedValue('расшифрованный текст'),
}));

vi.mock('../ai/extractor', () => ({
  extractClientSettings: vi.fn().mockResolvedValue({
    dnaBrand: 'Тестовый бренд',
    productDetails: 'Продукты',
    role: 'Эксперт',
    cta: 'Переходите',
    imageStyle: 'реалистичное фото',
    tonality: 'Официальный',
    targetAudience: 'Дачники',
    negativePrompt: 'Без цен',
    contentTypes: ['ТОП-10'],
    trustedSites: ['https://example.com/info'],
    operationMode: 'safe' as const,
    logoUrl: null,
  }),
}));

vi.mock('../config', () => ({
  config: {
    google: {
      templateSpreadsheetId: 'template-id',
      adminEmail: '',
    },
    telegram: {
      botToken: 'mock-token',
      notifyChatId: '',
    },
  },
}));

describe('onboardingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('выбрасывает ошибку, если нет ни одного ответа', async () => {
    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [
        { step: 1, question: 'Q1', answer: null, audio: null },
        { step: 2, question: 'Q2', answer: null, audio: null },
      ],
    };
    await expect(processWebOnboarding(input)).rejects.toThrow(
      'Нет ни одного ответа для обработки'
    );
  });

  it('выбрасывает ошибку при невалидном URL аудио (относительный путь)', async () => {
    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [
        {
          step: 1,
          question: 'Q1',
          answer: null,
          audio: 'uploads/user_13/audio/step_1.webm',
        },
      ],
    };
    await expect(processWebOnboarding(input)).rejects.toThrow(
      'Недопустимый URL аудио'
    );
  });

  it('выбрасывает ошибку при http:// URL аудио (только https)', async () => {
    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [
        {
          step: 1,
          question: 'Q1',
          answer: null,
          audio: 'http://example.com/audio.webm',
        },
      ],
    };
    await expect(processWebOnboarding(input)).rejects.toThrow(
      'Недопустимый URL аудио'
    );
  });

  it('успешно обрабатывает текстовые ответы без аудио', async () => {
    const input = {
      user: { name: 'Питомник Росток', email: 'manager@gmail.com' },
      answers: [
        { step: 1, question: 'О продукте', answer: 'Саженцы роз', audio: null },
        { step: 2, question: 'Аудитория', answer: 'Дачники 35+', audio: null },
      ],
    };
    const result = await processWebOnboarding(input);
    expect(result.clientId).toBe('client-123');
    expect(result.spreadsheetId).toBe('sheet-123');
    expect(result.spreadsheetUrl).toContain('docs.google.com');
  });

  it('передаёт в provisionClient поля из экстрактора и safe-пресет', async () => {
    const { provisionClient } = await import('./clientProvisioning');
    await processWebOnboarding({
      user: { name: 'Test', email: 'a@b.com' },
      answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }],
    });
    expect(provisionClient).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          role: 'Эксперт',
          tonality: 'Официальный',
          targetAudience: 'Дачники',
          negativePrompt: 'Без цен',
          contentTypes: ['ТОП-10'],
          trustedSites: ['https://example.com/info'],
          operationMode: 'safe',
          maxArticlesPerDay: 5,
          publishIntervalMin: 60,
          imageGenMode: 'scheduled',
        }),
      })
    );
  });

  it('при operationMode turbo применяет turbo-пресет', async () => {
    const { extractClientSettings } = await import('../ai/extractor');
    const { provisionClient } = await import('./clientProvisioning');
    vi.mocked(extractClientSettings).mockResolvedValueOnce({
      dnaBrand: 'B',
      productDetails: 'P',
      role: 'Эксперт',
      cta: 'C',
      imageStyle: 'фото',
      tonality: '',
      targetAudience: '',
      negativePrompt: '',
      contentTypes: [],
      trustedSites: [],
      operationMode: 'turbo',
      logoUrl: null,
    });
    await processWebOnboarding({
      user: { name: 'T', email: 'a@b.com' },
      answers: [{ step: 1, question: 'Q', answer: 'A', audio: null }],
    });
    expect(provisionClient).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          operationMode: 'turbo',
          maxArticlesPerDay: 15,
          publishIntervalMin: 10,
          imageGenMode: 'immediate',
        }),
      })
    );
  });

  it('при пустом templateSpreadsheetId возвращает spreadsheetUrl: null', async () => {
    const { provisionClient } = await import('./clientProvisioning');
    vi.mocked(provisionClient).mockResolvedValueOnce({
      clientId: 'client-123',
      spreadsheetId: null,
      spreadsheetUrl: null,
    });

    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [{ step: 1, question: 'Q1', answer: 'Текст', audio: null }],
    };
    const result = await processWebOnboarding(input);
    expect(result.clientId).toBe('client-123');
    expect(result.spreadsheetId).toBeNull();
    expect(result.spreadsheetUrl).toBeNull();
  });

  it('успешно обрабатывает смешанные текст + аудио', async () => {
    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [
        { step: 1, question: 'Q1', answer: 'Текст', audio: null },
        {
          step: 2,
          question: 'Q2',
          answer: null,
          audio: 'https://example.com/audio.webm',
        },
      ],
    };
    const result = await processWebOnboarding(input);
    expect(result.clientId).toBe('client-123');
    const { extractClientSettings } = await import('../ai/extractor');
    expect(extractClientSettings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('Текст'),
        expect.stringContaining('расшифрованный текст'),
      ])
    );
  });

  it('при сбое provisionClient пробрасывает ошибку (500)', async () => {
    const { provisionClient } = await import('./clientProvisioning');
    vi.mocked(provisionClient).mockRejectedValueOnce(new Error('DB connection failed'));

    const input = {
      user: { name: 'Test', email: 'test@example.com' },
      answers: [{ step: 1, question: 'Q1', answer: 'Текст', audio: null }],
    };
    await expect(processWebOnboarding(input)).rejects.toThrow('DB connection failed');
  });

  it('при сбое транскрибации аудио подставляет placeholder и продолжает', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { transcribeAudio } = await import('../telegram/media');
      vi.mocked(transcribeAudio).mockRejectedValueOnce(new Error('OpenRouter failed'));

      const input = {
        user: { name: 'Test', email: 'test@example.com' },
        answers: [
          { step: 1, question: 'Q1', answer: 'Текст', audio: null },
          {
            step: 2,
            question: 'Q2',
            answer: null,
            audio: 'https://example.com/audio.webm',
          },
        ],
      };
      const result = await processWebOnboarding(input);
      expect(result.clientId).toBe('client-123');
      const { extractClientSettings } = await import('../ai/extractor');
      expect(extractClientSettings).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('Текст'),
          expect.stringContaining('Ошибка расшифровки аудио'),
        ])
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
