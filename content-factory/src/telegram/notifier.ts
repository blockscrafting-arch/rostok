/**
 * Бот уведомлений: ошибки, сводка, публикации — в личный чат заказчика.
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { serializeError } from '../utils/logger';
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
      console.error('Notify failed:', { chatId: chatIds[i], errorMessage: serializeError(r.reason).message });
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

/** Клиент для сводки: общая по всем + персональная по каждому (AGENTS.md). */
export interface DailySummaryClient {
  id: string;
  name: string;
  spreadsheetId: string;
}

/**
 * Ежедневная сводка: день, неделя, месяц, средняя цена. Вызывается из scheduler по расписанию.
 * В мульти-клиенте: сначала общая по всем клиентам, затем блок по каждому клиенту (персональная).
 * В режиме одной таблицы: одна сводка по config.
 */
export async function sendDailySummary(
  errors?: string[],
  options?: { clients?: DailySummaryClient[] }
): Promise<void> {
  const fmt = (v: number) => v.toFixed(4);
  let text: string;

  if (options?.clients?.length) {
    const clients = options.clients.filter((c) => c.spreadsheetId?.trim());
    const allStats = await Promise.all(
      clients.map(async (c) => {
        const [day, week, month] = await Promise.all([
          getTodayStats({ spreadsheetId: c.spreadsheetId }),
          getWeekStats({ spreadsheetId: c.spreadsheetId }),
          getMonthStats({ spreadsheetId: c.spreadsheetId }),
        ]);
        return { client: c, day, week, month };
      })
    );
    const totalDay = allStats.reduce((a, s) => ({ count: a.count + s.day.count, totalCostUsd: a.totalCostUsd + s.day.totalCostUsd }), { count: 0, totalCostUsd: 0 });
    const totalWeek = allStats.reduce((a, s) => ({ count: a.count + s.week.count, totalCostUsd: a.totalCostUsd + s.week.totalCostUsd }), { count: 0, totalCostUsd: 0 });
    const totalMonth = allStats.reduce((a, s) => ({ count: a.count + s.month.count, totalCostUsd: a.totalCostUsd + s.month.totalCostUsd }), { count: 0, totalCostUsd: 0 });

    text = '<b>Общая по всем клиентам</b>\n';
    text += `<b>Сводка за день</b>\nСтатей: ${totalDay.count}\nРасход: $${fmt(totalDay.totalCostUsd)}\n`;
    text += `\n<b>За неделю</b>\nСтатей: ${totalWeek.count}\nРасход: $${fmt(totalWeek.totalCostUsd)}\n`;
    text += `\n<b>За месяц</b>\nСтатей: ${totalMonth.count}\nРасход: $${fmt(totalMonth.totalCostUsd)}\n`;

    for (const { client, day, week, month } of allStats) {
      text += `\n<b>Клиент: ${escapeHtml(client.name)}</b>\n`;
      text += `День: ${day.count} статей, $${fmt(day.totalCostUsd)}`;
      if (day.count > 0) text += ` (ср. $${fmt(day.avgCostUsd)})`;
      text += `\nНеделя: ${week.count}, $${fmt(week.totalCostUsd)}`;
      if (week.count > 0) text += ` (ср. $${fmt(week.avgCostUsd)})`;
      text += `\nМесяц: ${month.count}, $${fmt(month.totalCostUsd)}`;
      if (month.count > 0) text += ` (ср. $${fmt(month.avgCostUsd)})`;
      text += '\n';
    }
  } else {
    const [day, week, month] = await Promise.all([
      getTodayStats(),
      getWeekStats(),
      getMonthStats(),
    ]);
    text = `<b>Сводка за день</b>\nСтатей: ${day.count}\nРасход: $${fmt(day.totalCostUsd)}`;
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
  }

  if (errors?.length) {
    text += '\n\nОшибки:\n' + errors.slice(0, 5).map(escapeHtml).join('\n');
  }
  await notify(text);
}
