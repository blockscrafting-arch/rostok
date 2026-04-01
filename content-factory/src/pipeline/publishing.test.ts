import { describe, it, expect } from 'vitest';
import { allowLegacyTelegramChannelFromEnv, formatPublishNotifyHtml } from './publishing';
import { truncateAtSentence, insertCatalogLinks } from '../utils/text';
import { markdownToTelegramHtml } from '../utils/markdownToHtml';

describe('allowLegacyTelegramChannelFromEnv', () => {
  it('true только для clientId default', () => {
    expect(allowLegacyTelegramChannelFromEnv('default')).toBe(true);
    expect(allowLegacyTelegramChannelFromEnv('  default  ')).toBe(true);
  });

  it('false для мульти-клиента (uuid) и пустого clientId', () => {
    expect(allowLegacyTelegramChannelFromEnv('09af532c-19a9-464b-b8ed-af725cca10fb')).toBe(false);
    expect(allowLegacyTelegramChannelFromEnv('')).toBe(false);
    expect(allowLegacyTelegramChannelFromEnv('   ')).toBe(false);
    expect(allowLegacyTelegramChannelFromEnv(undefined)).toBe(false);
  });
});

describe('formatPublishNotifyHtml', () => {
  it('с непустым URL — ссылка', () => {
    const s = formatPublishNotifyHtml('https://t.me/c/1/2', 'Заголовок');
    expect(s).toContain('<a href=');
    expect(s).toContain('https://t.me/c/1/2');
    expect(s).toContain('Заголовок');
  });

  it('пустой URL — без href', () => {
    const s = formatPublishNotifyHtml('', 'Заголовок');
    expect(s).not.toContain('<a ');
    expect(s).toContain('Заголовок');
    expect(s).toContain('недоступна');
  });
});

describe('pipeline: HTML не превышает лимит Telegram', () => {
  const utmUrl =
    'https://rostok.ru/catalog?utm_source=telegram&utm_medium=post&utm_campaign=spring2026';

  it('длинный текст (~4000 симв) после UTM-вставки и HTML-конвертации остаётся ≤ 4096 символов', () => {
    const paragraph =
      '## Заголовок раздела\n\n**Жирный текст** в начале абзаца. ' +
      'Обычный текст с деталями про сорт клубники Альбион.\n\n';
    const longText =
      paragraph.repeat(12) +
      '[ССЫЛКА НА КАТАЛОГ]\n\n' +
      'Завершающий абзац с **важной информацией** для читателя.';

    const withLinks = insertCatalogLinks(longText, utmUrl);
    const cleaned = withLinks
      .replace(/\[ССЫЛКА НА КАТАЛОГ\]/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const raw = truncateAtSentence(cleaned, 3900);
    const html = markdownToTelegramHtml(raw);

    expect(html.length).toBeLessThanOrEqual(4096);
  });

  it('HTML не содержит незакрытых тегов <b> после усечения', () => {
    // Реалистичная плотность: ~1 bold-фраза каждые 100+ символов
    const para = 'Обычный текст абзаца для тестирования. Продолжение предложения. ';
    const boldPara = '**Жирная фраза** в начале абзаца. Обычный текст для проверки. ';
    const longText =
      '## Первый раздел\n\n' +
      (para.repeat(2) + boldPara + '\n\n').repeat(18) +
      '[ССЫЛКА НА КАТАЛОГ]';

    const withLinks = insertCatalogLinks(longText, utmUrl);
    const cleaned = withLinks.replace(/\n{3,}/g, '\n\n').trim();
    const raw = truncateAtSentence(cleaned, 3900);
    const html = markdownToTelegramHtml(raw);

    const openTags = (html.match(/<b>/g) ?? []).length;
    const closeTags = (html.match(/<\/b>/g) ?? []).length;
    expect(openTags).toBe(closeTags);
    expect(html.length).toBeLessThanOrEqual(4096);
  });
});
