/**
 * Публикация постов в Telegram-канал (Telegraf).
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';

const bot = new Telegraf(config.telegram.botToken);
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Отправить текст в канал (HTML). Текст обрезается до 4096 символов (лимит Telegram).
 */
export async function publishToChannel(html: string, imageUrl?: string): Promise<{ messageId: number; postUrl: string }> {
  const channelId = config.telegram.channelId;
  const username = channelId.startsWith('@') ? channelId.slice(1) : channelId;
  
  let msg;
  if (imageUrl) {
    try {
      // Отправляем картинку, а текст привязываем в caption. 
      // Если текст больше 1024 символов, Telegram может выдать ошибку, поэтому обрезаем caption,
      // либо можно отправить сначала фото без подписи, а вторым сообщением текст (реплай на фото).
      // Чтобы сохранить логику "один пост", отправляем 2 сообщения и берём ссылку на второе.
      
      const photoMsg = await bot.telegram.sendPhoto(channelId, imageUrl);
      
      const toSend = html.slice(0, MAX_MESSAGE_LENGTH);
      msg = await bot.telegram.sendMessage(channelId, toSend, { 
        parse_mode: 'HTML',
        reply_parameters: { message_id: photoMsg.message_id }
      });
      
    } catch (e) {
      // Фоллбэк: если фото не отправилось, шлём просто текст
      console.error('Failed to send photo to Telegram:', e);
      const toSend = html.slice(0, MAX_MESSAGE_LENGTH);
      msg = await bot.telegram.sendMessage(channelId, toSend, { parse_mode: 'HTML' });
    }
  } else {
    const toSend = html.slice(0, MAX_MESSAGE_LENGTH);
    msg = await bot.telegram.sendMessage(channelId, toSend, { parse_mode: 'HTML' });
  }

  const postUrl = `https://t.me/${username}/${msg.message_id}`;
  return { messageId: msg.message_id, postUrl };
}
