/**
 * Авто-захват notifyChatId: собираем все chat_id от /start среди pending-апдейтов бота клиента,
 * мёржим с уже сохранёнными в БД (дедупликация), подтверждаем (consume) все апдейты через offset.
 * Запускается каждый цикл планировщика, чтобы подхватывать новых подписчиков.
 */
import { Telegraf } from 'telegraf';
import type { Update } from 'telegraf/types';
import { prisma } from '../db/client';
import { logInfo, logWarn, serializeError } from '../utils/logger';

function isStartMessageUpdate(u: Update): u is Update.MessageUpdate {
  if (!('message' in u) || u.message == null) return false;
  const msg = u.message;
  if (!('text' in msg) || typeof msg.text !== 'string') return false;
  return msg.text === '/start' || msg.text.startsWith('/start ');
}

export async function captureNotifyChatIdFromStart(
  clientId: string,
  botToken: string,
  existingNotifyChatId: string | null | undefined
): Promise<string | null> {
  const bot = new Telegraf(botToken);
  try {
    const webhookInfo = await bot.telegram.getWebhookInfo();
    if (webhookInfo.url) return null; // бот работает через webhook — getUpdates недоступен

    const updates = await bot.telegram.getUpdates(30, 100, 0, ['message']);
    if (updates.length === 0) return null;

    // Подтверждаем обработку всех апдейтов (сдвигаем offset) — независимо от /start
    const maxOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await bot.telegram.getUpdates(0, 1, maxOffset, []).catch(() => {});

    // Собираем все chat_id из /start сообщений
    const newIds = updates.filter(isStartMessageUpdate).map((u) => String(u.message.chat.id));

    if (newIds.length === 0) return null;

    // Мёржим с существующими (дедупликация)
    const existing = existingNotifyChatId
      ? existingNotifyChatId.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const merged = Array.from(new Set([...existing, ...newIds]));
    const merged_str = merged.join(',');

    if (merged_str === existingNotifyChatId) return null; // ничего нового

    await prisma.client.update({
      where: { id: clientId },
      data: { notifyChatId: merged_str },
    });
    logInfo('notifyChatId updated from /start', {
      clientId,
      newIds,
      total: merged.length,
      notifyChatId: merged_str,
    });
    return merged_str;
  } catch (e) {
    logWarn('captureNotifyChatIdFromStart failed', { clientId, error: serializeError(e).message });
    return null;
  }
}
