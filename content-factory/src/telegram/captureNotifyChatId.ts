/**
 * Авто-захват notifyChatId: ищем первый /start среди pending-апдейтов бота клиента,
 * сохраняем chat_id в БД и подтверждаем (consume) все апдейты через offset.
 */
import { Telegraf } from 'telegraf';
import { prisma } from '../db/client';
import { logInfo, logWarn, serializeError } from '../utils/logger';

export async function captureNotifyChatIdFromStart(
  clientId: string,
  botToken: string
): Promise<string | null> {
  const bot = new Telegraf(botToken);
  try {
    const updates = await bot.telegram.getUpdates(30, 100, undefined, ['message']);
    if (updates.length === 0) return null;

    const startUpdate = updates.find(
      (u) => u.message?.text === '/start' || u.message?.text?.startsWith('/start ')
    );

    // Подтверждаем обработку всех апдейтов (сдвигаем offset)
    const maxOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await bot.telegram.getUpdates(0, 1, maxOffset, []).catch(() => {});

    if (!startUpdate?.message) return null;

    const chatId = String(startUpdate.message.chat.id);

    await prisma.client.update({
      where: { id: clientId },
      data: { notifyChatId: chatId },
    });
    logInfo('notifyChatId captured from /start', { clientId, notifyChatId: chatId });
    return chatId;
  } catch (e) {
    logWarn('captureNotifyChatIdFromStart failed', { clientId, error: serializeError(e).message });
    return null;
  }
}
