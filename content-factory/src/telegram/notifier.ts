/**
 * Бот уведомлений: ошибки, сводка, публикации — в личный чат заказчика.
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';

const bot = new Telegraf(config.telegram.botToken);

/**
 * Отправить уведомление в чат заказчика (HTML).
 */
export async function notify(message: string): Promise<void> {
  try {
    await bot.telegram.sendMessage(config.telegram.notifyChatId, message, {
      parse_mode: 'HTML',
    });
  } catch (e) {
    console.error('Notify failed:', e);
  }
}

/**
 * Ежедневная сводка (статьи, расходы). Вызывается из scheduler по расписанию.
 */
export async function sendDailySummary(
  articlesCount: number,
  totalCostRub: number,
  errors?: string[]
): Promise<void> {
  let text = `<b>Сводка за день</b>\nСтатей: ${articlesCount}\nРасход: ${totalCostRub.toFixed(2)} ₽`;
  if (errors?.length) {
    text += `\n\nОшибки:\n${errors.slice(0, 5).join('\n')}`;
  }
  await notify(text);
}
