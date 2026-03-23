import { describe, it, expect } from 'vitest';
import { formatPublishNotifyHtml } from './publishing';

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
