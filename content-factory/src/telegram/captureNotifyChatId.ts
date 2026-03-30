/**
 * Авто-захват notifyChatId: собираем все chat_id от /start среди pending-апдейтов бота клиента,
 * мёржим с уже сохранёнными в БД (дедупликация), подтверждаем (consume) все апдейты через offset.
 * Запускается каждый цикл планировщика, чтобы подхватывать новых подписчиков.
 */
import { Telegraf } from 'telegraf';
import { prisma } from '../db/client';
import { logInfo, logWarn, serializeError } from '../utils/logger';

export async function captureNotifyChatIdFromStart(
  clientId: string,
  botToken: string,
  existingNotifyChatId: string | null | undefined
): Promise<string | null> {
  const bot = new Telegraf(botToken);
  try {
    const webhookInfo = await bot.telegram.getWebhookInfo();
    if (webhookInfo.url) return null; // бот работает через webhook — getUpdates недоступен

    const updates = await bot.telegram.getUpdates(30, 100, undefined, ['message']);
    if (updates.length === 0) return null;

    // Подтверждаем обработку всех апдейтов (сдвигаем offset) — независимо от /start
    const maxOffset = Math.max(...updates.map((u) => u.update_id)) + 1;
    await bot.telegram.getUpdates(0, 1, maxOffset, []).catch(() => {});

    // Собираем все chat_id из /start сообщений
    const newIds = updates
      .filter((u) => u.message?.text === '/start' || u.message?.text?.startsWith('/start '))
      .map((u) => String(u.message!.chat.id));

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
