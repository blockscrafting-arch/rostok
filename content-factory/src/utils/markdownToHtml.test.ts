import { describe, it, expect } from 'vitest';
import { markdownToTelegramHtml } from './markdownToHtml';

describe('markdownToTelegramHtml', () => {
  it('пустая строка возвращает пустую', () => {
    expect(markdownToTelegramHtml('')).toBe('');
  });

  it('**bold** → <b>bold</b>', () => {
    expect(markdownToTelegramHtml('**жирный**')).toBe('<b>жирный</b>');
  });

  it('*italic* → <i>italic</i>', () => {
    expect(markdownToTelegramHtml('*курсив*')).toBe('<i>курсив</i>');
  });

  it('ссылка [text](url) → <a href="url">text</a>', () => {
    expect(markdownToTelegramHtml('[ссылка](https://example.com)')).toBe(
      '<a href="https://example.com">ссылка</a>'
    );
  });

  it('`code` → <code>code</code>', () => {
    expect(markdownToTelegramHtml('`код`')).toBe('<code>код</code>');
  });

  it('экранирует & < > " в тексте', () => {
    expect(markdownToTelegramHtml('a & b < c > d "e"')).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot;'
    );
  });

  it('заголовки # текст → <b>текст</b>', () => {
    expect(markdownToTelegramHtml('# Заголовок')).toBe('<b>Заголовок</b>');
    expect(markdownToTelegramHtml('## Подзаголовок')).toBe('<b>Подзаголовок</b>');
  });
});
