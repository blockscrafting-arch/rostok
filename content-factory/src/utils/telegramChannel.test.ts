import { describe, it, expect } from 'vitest';
import {
  buildTelegramPostUrl,
  isTelegramNumericChatId,
  normalizeTelegramChannelIdForSend,
} from './telegramChannel';

describe('telegramChannel', () => {
  it('normalizeTelegramChannelIdForSend: числовой id без изменений', () => {
    expect(normalizeTelegramChannelIdForSend('-1001234567890')).toBe('-1001234567890');
    expect(normalizeTelegramChannelIdForSend('-42')).toBe('-42');
  });

  it('normalizeTelegramChannelIdForSend: @ оставляет', () => {
    expect(normalizeTelegramChannelIdForSend('@my_channel')).toBe('@my_channel');
  });

  it('normalizeTelegramChannelIdForSend: username без @', () => {
    expect(normalizeTelegramChannelIdForSend('my_channel')).toBe('@my_channel');
  });

  it('normalizeTelegramChannelIdForSend: пусто', () => {
    expect(normalizeTelegramChannelIdForSend('')).toBe('');
    expect(normalizeTelegramChannelIdForSend('   ')).toBe('');
  });

  it('isTelegramNumericChatId', () => {
    expect(isTelegramNumericChatId('-1001')).toBe(true);
    expect(isTelegramNumericChatId('@x')).toBe(false);
  });

  it('buildTelegramPostUrl: -100…', () => {
    expect(buildTelegramPostUrl('-1001234567890', 99)).toBe('https://t.me/c/1234567890/99');
  });

  it('buildTelegramPostUrl: @username', () => {
    expect(buildTelegramPostUrl('@news', 5)).toBe('https://t.me/news/5');
  });

  it('buildTelegramPostUrl: неизвестный числовой формат — пусто', () => {
    expect(buildTelegramPostUrl('-50', 1)).toBe('');
  });
});
