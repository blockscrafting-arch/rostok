import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockChannelId = vi.hoisted(() => ({ value: '@legacy_channel' }));

vi.mock('../config', () => ({
  config: {
    telegram: {
      get channelId() {
        return mockChannelId.value;
      },
    },
  },
}));

import { resolveChannelIdForPublish } from './publisher';

describe('resolveChannelIdForPublish', () => {
  beforeEach(() => {
    mockChannelId.value = '@legacy_channel';
  });

  it('возвращает override если не пустой', () => {
    expect(resolveChannelIdForPublish('  @client_ch  ', false)).toBe('@client_ch');
  });

  it('мульти-клиент: пустой override и allowFallback false — ошибка', () => {
    expect(() => resolveChannelIdForPublish(undefined, false)).toThrow(
      /Не задан telegramChannelId для клиента/
    );
    expect(() => resolveChannelIdForPublish('   ', false)).toThrow(
      /Не задан telegramChannelId для клиента/
    );
  });

  it('легаси: пустой override и allowFallback true — из .env', () => {
    expect(resolveChannelIdForPublish(undefined, true)).toBe('@legacy_channel');
  });

  it('легаси: пустой config — ошибка', () => {
    mockChannelId.value = '  ';
    expect(() => resolveChannelIdForPublish(undefined, true)).toThrow(/легаси/);
  });
});
