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
    utmTemplate: '?utm_source=dzen&utm_medium=article&utm_campaign={campaign}',
    telegramChannelId: '',
    maxArticlesPerDay: 10,
    moderationEnabled: true,
    pollInterval: 60000,
    dailySummaryTime: '21:00',
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
});
