import { describe, it, expect } from 'vitest';
import { allowLegacyTelegramChannelFromEnv, formatPublishNotifyHtml } from './publishing';

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
