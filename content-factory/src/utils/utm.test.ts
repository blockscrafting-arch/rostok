import { describe, it, expect } from 'vitest';
import { buildUtmUrl } from './utm';
import type { Settings } from '../types';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    role: '',
    prompt1: '',
    prompt2: '',
    prompt3: '',
    dnaBrandUrl: '',
    catalogDocUrl: '',
    dnaBrandText: '',
    catalogMap: {},
    referencePhotoMap: {},
    utmTemplate: '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}',
    telegramChannelId: '',
    maxArticlesPerDay: 10,
    moderationEnabled: true,
    pollInterval: 60000,
    dailySummaryTime: '21:00',
    generationTime: '05:00',
    imageGenerationMode: 'scheduled',
    publishIntervalMin: 60,
    publishWindowStart: '',
    publishWindowEnd: '',
    ...overrides,
  };
}

describe('buildUtmUrl', () => {
  it('подставляет campaign из заголовка в шаблон только с параметрами', () => {
    const settings = makeSettings({
      utmTemplate: '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}',
      catalogMap: {},
    });
    const url = buildUtmUrl('5 роз для Сибири', settings);
    expect(url).toContain('utm_campaign=');
    expect(url).toMatch(/5-роз-для-сибири/);
  });

  it('находит раздел каталога по заголовку и добавляет baseUrl', () => {
    const settings = makeSettings({
      catalogMap: { 'Розы': 'https://site.ru/catalog/roses' },
      utmTemplate: '?utm_source=dzen&utm_campaign={campaign}',
    });
    const url = buildUtmUrl('Розы для Сибири', settings);
    expect(url).toContain('https://site.ru/catalog/roses');
    expect(url).toContain('utm_source=dzen');
  });

  it('при отсутствии совпадения берёт первый URL из справочника', () => {
    const settings = makeSettings({
      catalogMap: {
        'Гортензии': 'https://site.ru/hydrangea',
        'Розы': 'https://site.ru/roses',
      },
      utmTemplate: '?utm_source=dzen&utm_campaign={campaign}',
    });
    const url = buildUtmUrl('Пионы в саду', settings);
    expect(url).toContain('https://site.ru/hydrangea');
  });

  it('возвращает только шаблон если catalogMap пуст и шаблон без http', () => {
    const settings = makeSettings({
      catalogMap: {},
      utmTemplate: '?utm_source=dzen&utm_campaign={campaign}',
    });
    const url = buildUtmUrl('Любой заголовок', settings);
    expect(url).toBe('?utm_source=dzen&utm_campaign=любой-заголовок');
  });

  it('подставляет {keyword} в utm_content из третьего аргумента', () => {
    const settings = makeSettings({
      catalogMap: {},
      utmTemplate: '?utm_source=dzen&utm_medium=organic&utm_campaign=content_zavod&utm_content={keyword}',
    });
    const url = buildUtmUrl('Смета на ленивый розарий', settings, 'саженцы роз');
    expect(url).toContain('utm_content=');
    expect(url).toContain(encodeURIComponent('саженцы роз'));
    expect(url).not.toContain('{keyword}');
  });

  it('раскодирует шаблон с %7Bcampaign%7D и %7Bkeyword%7D (копирование из Дзена/браузера)', () => {
    const settings = makeSettings({
      catalogMap: {},
      utmTemplate: '?utm_source=dzen&utm_medium=content_zavod&utm_campaign=%7Bcampaign%7D&utm_content=%7Bkeyword%7D',
    });
    const url = buildUtmUrl('Розы для Сибири', settings, 'саженцы роз');
    expect(url).toContain('utm_campaign=');
    expect(url).toContain('utm_content=');
    expect(url).toMatch(/utm_campaign=розы-для-сибири/);
    expect(url).toContain(encodeURIComponent('саженцы роз'));
    expect(url).not.toContain('%7Bcampaign%7D');
    expect(url).not.toContain('%7Bkeyword%7D');
  });
});
