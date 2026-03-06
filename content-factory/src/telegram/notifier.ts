/**
 * Бот уведомлений: ошибки, сводка, публикации — в личный чат заказчика.
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { getTodayStats, getWeekStats, getMonthStats } from '../sheets/statistics';

const bot = new Telegraf(config.telegram.botToken);

/** Список chat ID для уведомлений (TELEGRAM_NOTIFY_CHAT_ID — один или несколько через запятую). */
function getNotifyChatIds(): string[] {
  return config.telegram.notifyChatId
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/**
 * Отправить уведомление в чат(ы) заказчика (HTML).
 * Поддерживает несколько ID в TELEGRAM_NOTIFY_CHAT_ID через запятую.
 */
export async function notify(message: string): Promise<void> {
  const chatIds = getNotifyChatIds();
  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
    )
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('Notify failed:', { chatId: chatIds[i], error: r.reason });
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Ежедневная сводка: день, неделя, месяц, средняя цена. Вызывается из scheduler по расписанию.
 */
export async function sendDailySummary(errors?: string[]): Promise<void> {
  const [day, week, month] = await Promise.all([
    getTodayStats(),
    getWeekStats(),
    getMonthStats(),
  ]);
  const fmt = (v: number) => v.toFixed(4);
  let text = `<b>Сводка за день</b>\nСтатей: ${day.count}\nРасход: $${fmt(day.totalCostUsd)}`;
  if (day.count > 0) {
    text += `\nСредняя за статью: $${fmt(day.avgCostUsd)}`;
  }
  text += `\n\n<b>За неделю</b>\nСтатей: ${week.count}\nРасход: $${fmt(week.totalCostUsd)}`;
  if (week.count > 0) {
    text += `\nСредняя за статью: $${fmt(week.avgCostUsd)}`;
  }
  text += `\n\n<b>За месяц</b>\nСтатей: ${month.count}\nРасход: $${fmt(month.totalCostUsd)}`;
  if (month.count > 0) {
    text += `\nСредняя за статью: $${fmt(month.avgCostUsd)}`;
  }
  if (errors?.length) {
    text += '\n\nОшибки:\n' + errors.slice(0, 5).map(escapeHtml).join('\n');
  }
  await notify(text);
}
