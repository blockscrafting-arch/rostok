import { describe, it, expect } from 'vitest';
import { buildOnboardingSettingsSheetPairs } from './settingsWriter';
import type { OnboardingSettingsForDb } from '../types/onboarding';

const base: OnboardingSettingsForDb = {
  role: 'Эксперт',
  contentTypes: ['обзор', 'ТОП-10'],
  trustedSites: ['https://a.com', 'https://b.com'],
  productDetails: 'Розы',
  dnaBrand: 'ДНК тест',
  cta: 'В каталог',
  imageStyle: 'фото',
  tonality: 'дружелюбно',
  targetAudience: 'дачники',
  negativePrompt: 'без цен',
  operationMode: 'safe',
  maxArticlesPerDay: 5,
  publishIntervalMin: 60,
  generationTime: '05:00',
  imageGenMode: 'scheduled',
  moderationEnabled: true,
  logoUrl: null,
  telegramChannelId: null,
};

describe('buildOnboardingSettingsSheetPairs', () => {
  it('включает роль, лимиты и текстовые поля онбординга', () => {
    const pairs = buildOnboardingSettingsSheetPairs(base);
    const map = Object.fromEntries(pairs);
    expect(map['Роль']).toBe('Эксперт');
    expect(map['Максимум статей в день']).toBe('5');
    expect(map['Режим модерации']).toBe('да');
    expect(map['Время генерации картинок']).toBe('05:00');
    expect(map['Режим генерации картинки']).toBe('По времени');
    expect(map['ДНК Бренда']).toBe('ДНК тест');
    expect(map['Типы контента']).toBe('обзор, ТОП-10');
    expect(map['Доверенные сайты']).toContain('https://a.com');
  });

  it('immediate → Сразу', () => {
    const pairs = buildOnboardingSettingsSheetPairs({ ...base, imageGenMode: 'immediate' });
    const map = Object.fromEntries(pairs);
    expect(map['Режим генерации картинки']).toBe('Сразу');
  });
});
