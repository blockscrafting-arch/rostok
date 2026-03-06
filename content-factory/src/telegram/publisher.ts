/**
 * Публикация постов в Telegram-канал (Telegraf).
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';

const bot = new Telegraf(config.telegram.botToken);
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Отправить текст в канал (HTML). Только текст, без картинки. Лимит 4096 символов (Telegram).
 */
export async function publishToChannel(html: string): Promise<{ messageId: number; postUrl: string }> {
  const channelId = config.telegram.channelId;
  const username = channelId.startsWith('@') ? channelId.slice(1) : channelId;
  const toSend = html.slice(0, MAX_MESSAGE_LENGTH);
  const msg = await bot.telegram.sendMessage(channelId, toSend, { parse_mode: 'HTML' });
  const postUrl = `https://t.me/${username}/${msg.message_id}`;
  return { messageId: msg.message_id, postUrl };
}
