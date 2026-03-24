import { describe, it, expect } from 'vitest';
import { buildPrompt, buildPromptStatic, buildPromptDynamic, type PromptContext } from './builder';

describe('buildPrompt', () => {
  const baseCtx: PromptContext = {
    role: 'Эксперт',
    niche: 'сады',
    contentTypes: ['ТОП-10'],
    trustedSites: ['https://example.com'],
    dnaBrand: 'ДНК',
    cta: 'Подписывайтесь',
    imageStyle: 'фотореализм',
    tonality: 'Дружелюбный',
    targetAudience: 'Дачники',
    negativePrompt: 'Без цен.',
    headlineRules: 'Цепляющий заголовок',
    keyword: 'розы',
    keywords: 'розы, сорта',
    count: '30',
    headline: 'Заголовок',
    facts: 'Факты',
    productDetails: 'Продукт',
    text: 'Контекст статьи',
  };

  it('подставляет {tonality}', () => {
    expect(buildPrompt('Тональность: {tonality}.', baseCtx)).toBe('Тональность: Дружелюбный.');
  });

  it('подставляет {target_audience}', () => {
    expect(buildPrompt('Аудитория: {target_audience}.', baseCtx)).toBe('Аудитория: Дачники.');
  });

  it('подставляет {negative_prompt}', () => {
    expect(buildPrompt('Запреты: {negative_prompt}', baseCtx)).toBe('Запреты: Без цен.');
  });

  it('подставляет {text}', () => {
    expect(buildPrompt('Контекст: {text}', baseCtx)).toBe('Контекст: Контекст статьи');
  });

  it('подставляет все новые плейсхолдеры в одном шаблоне', () => {
    const t = 'Голос: {tonality}. Для: {target_audience}. Нельзя: {negative_prompt}';
    expect(buildPrompt(t, baseCtx)).toBe(
      'Голос: Дружелюбный. Для: Дачники. Нельзя: Без цен.'
    );
  });

  it('возвращает пустую строку при пустом шаблоне', () => {
    expect(buildPrompt('', baseCtx)).toBe('');
  });

  it('подставляет пустые значения при отсутствии полей', () => {
    const empty: PromptContext = {
      ...baseCtx,
      tonality: '',
      targetAudience: '',
      negativePrompt: '',
    };
    expect(buildPrompt('{tonality}|{target_audience}|{negative_prompt}', empty)).toBe('||');
  });
});

describe('buildPromptStatic / buildPromptDynamic', () => {
  const baseCtx: PromptContext = {
    role: 'Агроном',
    niche: 'сады',
    contentTypes: ['ТОП'],
    trustedSites: ['https://a.ru'],
    dnaBrand: 'Бренд',
    cta: 'Купить',
    imageStyle: 'фото',
    tonality: 'тепло',
    targetAudience: 'дачники',
    negativePrompt: 'пафос',
    headlineRules: 'правила',
    keyword: 'роза',
    keywords: 'роза, сорт',
    count: '30',
    headline: 'Мой заголовок',
    facts: 'Факт1',
    productDetails: 'Саженцы',
    text: 'текст статьи',
  };

  it('buildPromptStatic подставляет роль, не трогает {headline}', () => {
    const t = 'Роль: {role}. Тема: {headline}.';
    expect(buildPromptStatic(t, baseCtx)).toBe('Роль: Агроном. Тема: {headline}.');
  });

  it('buildPromptDynamic подставляет headline и keywords', () => {
    const t = 'Тема: «{headline}». КЗ: {keywords}.';
    expect(buildPromptDynamic(t, { headline: 'X', keywords: 'a, b' })).toBe('Тема: «X». КЗ: a, b.');
  });
});
