import { describe, it, expect } from 'vitest';
import { truncateTelegramHtml, TELEGRAM_MESSAGE_MAX_HTML } from './truncateTelegramHtml';
import { markdownToTelegramHtml } from './markdownToHtml';

describe('truncateTelegramHtml', () => {
  it('не меняет короткий HTML', () => {
    expect(truncateTelegramHtml('<b>hi</b>')).toBe('<b>hi</b>');
  });

  it('усечение до лимита и закрытие незакрытого <b>', () => {
    const long = '<b>' + 'а'.repeat(5000) + '</b>';
    const out = truncateTelegramHtml(long);
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX_HTML);
    expect(out).toMatch(/<\/b>$/);
    const openB = (out.match(/<b>/g) ?? []).length;
    const closeB = (out.match(/<\/b>/g) ?? []).length;
    expect(openB).toBe(closeB);
  });

  it('после markdownToTelegramHtml с «тяжёлой» разметкой результат ≤ 4096', () => {
    const chunk = '**x** '.repeat(700);
    const html = markdownToTelegramHtml(chunk);
    expect(html.length).toBeGreaterThan(TELEGRAM_MESSAGE_MAX_HTML);
    const safe = truncateTelegramHtml(html);
    expect(safe.length).toBeLessThanOrEqual(TELEGRAM_MESSAGE_MAX_HTML);
  });
});
