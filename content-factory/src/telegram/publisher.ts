/**
 * Публикация постов в Telegram-канал (тот же токен, что у appBot).
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { appBot } from './appBot';
import { buildTelegramPostUrl, normalizeTelegramChannelIdForSend } from '../utils/telegramChannel';

const MAX_MESSAGE_LENGTH = 4096;

export type PublishToChannelOptions = {
  /**
   * Если false и channelIdOverride пустой — ошибка, без fallback в TELEGRAM_CHANNEL_ID.
   * Для мульти-клиента (clientId !== 'default') всегда false — контент заказчика нельзя слать в легаси-канал.
   */
  allowConfigChannelFallback?: boolean;
};

/**
 * Выбрать chat_id: из override или из .env (только для легаси).
 */
export function resolveChannelIdForPublish(
  channelIdOverride: string | undefined,
  allowConfigChannelFallback: boolean
): string {
  const trimmed = (channelIdOverride ?? '').trim();
  if (trimmed) return trimmed;
  if (!allowConfigChannelFallback) {
    throw new Error(
      'Не задан telegramChannelId для клиента в БД. Публикация в общий канал (легаси) запрещена.'
    );
  }
  const fromConfig = config.telegram.channelId.trim();
  if (!fromConfig) {
    throw new Error('Для легаси не задан TELEGRAM_CHANNEL_ID в .env.');
  }
  return fromConfig;
}

/**
 * Отправить текст в канал (HTML). Только текст, без картинки. Лимит 4096 символов (Telegram).
 * @param html Текст сообщения в HTML.
 * @param channelIdOverride Канал клиента; при легаси и пустом override — config.telegram.channelId.
 * @param botTokenOverride Индивидуальный токен бота клиента.
 */
export async function publishToChannel(
  html: string,
  channelIdOverride?: string,
  botTokenOverride?: string,
  options?: PublishToChannelOptions
): Promise<{ messageId: number; postUrl: string }> {
  const allowFallback = options?.allowConfigChannelFallback !== false;
  const rawResolved = resolveChannelIdForPublish(channelIdOverride, allowFallback);
  const channelId = normalizeTelegramChannelIdForSend(rawResolved) || rawResolved;
  const toSend = html.slice(0, MAX_MESSAGE_LENGTH);

  const bot = botTokenOverride ? new Telegraf(botTokenOverride) : appBot;

  const msg = await bot.telegram.sendMessage(channelId, toSend, { parse_mode: 'HTML' });
  const postUrl = buildTelegramPostUrl(channelId, msg.message_id);
  return { messageId: msg.message_id, postUrl };
}
