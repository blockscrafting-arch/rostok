import { describe, it, expect } from 'vitest';
import { kvGet, buildClientSettingsUpdateFromSheet } from './sheetSettingsSync';
import type { Settings } from '../types';
import type { ClientSettings } from '@prisma/client';

const baseSettings = (overrides: Partial<Settings> = {}): Settings => ({
  role: 'Роль из листа',
  prompt1: '',
  prompt2: '',
  prompt3: '',
  dnaBrandUrl: '',
  catalogDocUrl: '',
  dnaBrandText: 'Текст ДНК из Doc',
  catalogMap: {},
  referencePhotoMap: {},
  utmTemplate: '?utm=x',
  telegramChannelId: '@ch',
  maxArticlesPerDay: 7,
  moderationEnabled: true,
  pollInterval: 60_000,
  dailySummaryTime: '22:00',
  generationTime: '06:00',
  imageGenerationMode: 'scheduled',
  publishIntervalMin: 45,
  publishWindowStart: '',
  publishWindowEnd: '',
  headlinesCount: 25,
  ...overrides,
});

const basePrev = (overrides: Partial<ClientSettings> = {}): ClientSettings =>
  ({
    id: 'cs-1',
    clientId: 'c-1',
    role: 'Старое',
    contentTypes: ['x'],
    trustedSites: ['https://old.com'],
    productDetails: 'old pd',
    dnaBrand: 'old dna',
    cta: 'old cta',
    imageStyle: 'old style',
    tonality: 'old ton',
    targetAudience: 'old ta',
    negativePrompt: 'old neg',
    operationMode: 'safe',
    logoUrl: null,
    utmTemplate: null,
    frequencyLimit: '300',
    maxArticlesPerDay: 5,
    moderationEnabled: true,
    publishIntervalMin: 60,
    publishWindowStart: '',
    publishWindowEnd: '',
    dailySummaryTime: '21:00',
    generationTime: '05:00',
    imageGenMode: 'scheduled',
    headlinesCount: 30,
    textModel: null,
    imageModel: null,
    groundingModel: null,
    updatedAt: new Date(),
    ...overrides,
  }) as ClientSettings;

describe('sheetSettingsSync', () => {
  it('kvGet перебирает ключи', () => {
    expect(kvGet({ A: '1', B: '2' }, 'X', 'A')).toBe('1');
    expect(kvGet({ A: '', B: '2' }, 'A', 'B')).toBe('2');
  });

  it('buildClientSettingsUpdateFromSheet: ДНК из dnaBrandText, CTA из byKey', () => {
    const s = baseSettings({ dnaBrandText: 'Новое ДНК' });
    const byKey = { CTA: 'Новый CTA', 'Типы контента': 'a, b' };
    const prev = basePrev();
    const u = buildClientSettingsUpdateFromSheet(s, byKey, prev);
    expect(u.dnaBrand).toBe('Новое ДНК');
    expect(u.cta).toBe('Новый CTA');
    expect(u.contentTypes).toEqual(['a', 'b']);
    expect(u.maxArticlesPerDay).toBe(7);
    expect(u.role).toBe('Роль из листа');
  });

  it('turbo из листа', () => {
    const s = baseSettings({ dnaBrandText: '' });
    const byKey = { 'Режим операции ИИ': 'turbo' };
    const prev = basePrev();
    const u = buildClientSettingsUpdateFromSheet(s, byKey, prev);
    expect(u.operationMode).toBe('turbo');
  });
});
