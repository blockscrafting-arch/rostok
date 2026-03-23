/**
 * Публикация постов в Telegram-канал (тот же токен, что у appBot).
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { appBot } from './appBot';
import { buildTelegramPostUrl, normalizeTelegramChannelIdForSend } from '../utils/telegramChannel';

const MAX_MESSAGE_LENGTH = 4096;

/**
 * Отправить текст в канал (HTML). Только текст, без картинки. Лимит 4096 символов (Telegram).
 * @param html Текст сообщения в HTML.
 * @param channelIdOverride Канал клиента; при отсутствии используется config.telegram.channelId.
 * @param botTokenOverride Индивидуальный токен бота клиента.
 */
export async function publishToChannel(
  html: string,
  channelIdOverride?: string,
  botTokenOverride?: string
): Promise<{ messageId: number; postUrl: string }> {
  let raw = (channelIdOverride ?? config.telegram.channelId).trim();
  if (!raw) raw = config.telegram.channelId.trim();
  const channelId = normalizeTelegramChannelIdForSend(raw) || raw;
  const toSend = html.slice(0, MAX_MESSAGE_LENGTH);

  const bot = botTokenOverride ? new Telegraf(botTokenOverride) : appBot;

  const msg = await bot.telegram.sendMessage(channelId, toSend, { parse_mode: 'HTML' });
  const postUrl = buildTelegramPostUrl(channelId, msg.message_id);
  return { messageId: msg.message_id, postUrl };
}
