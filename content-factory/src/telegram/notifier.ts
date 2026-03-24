/**
 * Бот уведомлений: ошибки, сводка, публикации — в личный чат заказчика.
 * Админам — полная сводка с расходами ($). Клиентам — только количество статей (без денег).
 */
import { Telegraf } from 'telegraf';
import { config } from '../config';
import { serializeError } from '../utils/logger';
import {
  getStatsByClientAndPeriod,
  getArticleCountByClientAndPeriod,
} from '../db/repositories/costRecords';
import { appBot } from './appBot';
import { assignOpenRouterKeyReplyMarkup } from './adminOpenRouterKey';
import {
  daysInCalendarMonth,
  getMskParts,
  mskWallTimeToDate,
} from '../utils/dateMsk';

/** Список chat ID для уведомлений (TELEGRAM_NOTIFY_CHAT_ID — один или несколько через запятую). */
function getNotifyChatIds(): string[] {
  return config.telegram.notifyChatId
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

/** Chat ID для уведомлений об онбординге; fallback на основной TELEGRAM_NOTIFY_CHAT_ID. */
function getOnboardingNotifyChatIds(): string[] {
  const raw = config.telegram.onboardingNotifyChatId?.trim();
  if (raw) {
    return raw.split(',').map((id) => id.trim()).filter(Boolean);
  }
  return getNotifyChatIds();
}

let _onboardingBot: Telegraf | null = null;

/** Бот для уведомлений об онбординге; fallback на appBot если токен не задан. */
function getOnboardingBot(): Telegraf {
  const token = config.telegram.onboardingBotToken?.trim();
  if (!token) return appBot;
  if (!_onboardingBot) {
    _onboardingBot = new Telegraf(token);
  }
  return _onboardingBot;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Уведомить админов о новом брифе (веб или Telegram).
 */
export async function notifyNewBrief(
  payload: {
    clientId: string;
    clientName: string;
    email: string;
    niche: string;
    spreadsheetUrl?: string | null;
  },
  source: 'web' | 'telegram'
): Promise<void> {
  const prefix = source === 'web' ? 'Новый клиент (веб-онбординг)!' : 'Новый клиент заполнил бриф!';
  const linkLine = payload.spreadsheetUrl
    ? `Ссылка на таблицу: ${escapeHtml(payload.spreadsheetUrl)}`
    : 'Таблица: будет создана администратором.';
  const idLine = payload.clientId
    ? `ID клиента (БД): <code>${escapeHtml(payload.clientId)}</code>`
    : '';
  const text = [
    prefix,
    idLine,
    `Имя: ${escapeHtml(payload.clientName)}`,
    `Email: ${escapeHtml(payload.email)}`,
    `Ниша: ${escapeHtml(payload.niche)}`,
    linkLine,
  ]
    .filter(Boolean)
    .join('\n');

  const bot = getOnboardingBot();
  const chatIds = getOnboardingNotifyChatIds();

  let markup;
  try {
    markup = assignOpenRouterKeyReplyMarkup(payload.clientId);
  } catch {
    markup = undefined;
  }

  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        ...(markup ? markup : {}),
      })
    )
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('Notify new brief failed:', {
        chatId: chatIds[i],
        errorMessage: serializeError(r.reason).message,
      });
    }
  });
}

/**
 * Отправить уведомление в чат(ы) заказчика (HTML).
 * Поддерживает несколько ID в TELEGRAM_NOTIFY_CHAT_ID через запятую.
 */
export async function notify(message: string): Promise<void> {
  const chatIds = getNotifyChatIds();
  const results = await Promise.allSettled(
    chatIds.map((chatId) =>
      appBot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' })
    )
  );
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error('Notify failed:', { chatId: chatIds[i], errorMessage: serializeError(r.reason).message });
    }
  });
}

/** Отправить сообщение в один чат (для персональной сводки клиенту). */
async function sendToChat(chatId: string, message: string): Promise<void> {
  try {
    await appBot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (e) {
    console.error('Send to client failed:', { chatId, errorMessage: serializeError(e).message });
  }
}

function dateRangeDay(): { from: Date; to: Date } {
  const now = new Date();
  const { year, month, day } = getMskParts(now);
  const from = mskWallTimeToDate(year, month, day, 0, 0, 0);
  const to = new Date(mskWallTimeToDate(year, month, day, 23, 59, 59).getTime() + 999);
  return { from, to };
}

function dateRangeWeek(): { from: Date; to: Date } {
  const now = new Date();
  const { year, month, day } = getMskParts(now);
  const todayStart = mskWallTimeToDate(year, month, day, 0, 0, 0);
  const from = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const to = new Date(mskWallTimeToDate(year, month, day, 23, 59, 59).getTime() + 999);
  return { from, to };
}

function dateRangeMonth(): { from: Date; to: Date } {
  const now = new Date();
  const { year, month } = getMskParts(now);
  const from = mskWallTimeToDate(year, month, 1, 0, 0, 0);
  const last = daysInCalendarMonth(year, month);
  const to = new Date(mskWallTimeToDate(year, month, last, 23, 59, 59).getTime() + 999);
  return { from, to };
}

/** Клиент для сводки: общая по всем + персональная по каждому (AGENTS.md). notifyChatId — куда слать клиенту сводку без денег. */
export interface DailySummaryClient {
  id: string;
  name: string;
  spreadsheetId: string;
  notifyChatId?: string | null;
}

/**
 * Ежедневная сводка: данные из БД (cost_records).
 * Админам (TELEGRAM_NOTIFY_CHAT_ID): полная сводка с расходами ($).
 * Клиентам (client.notifyChatId): только количество статей за день/неделю/месяц, без денег.
 */
export async function sendDailySummary(
  errors?: string[],
  options?: { clients?: DailySummaryClient[] }
): Promise<void> {
  const fmt = (v: number) => v.toFixed(4);
  const dayRange = dateRangeDay();
  const weekRange = dateRangeWeek();
  const monthRange = dateRangeMonth();

  if (options?.clients?.length) {
    const clients = options.clients.filter((c) => c.spreadsheetId?.trim());
    const allStats = await Promise.all(
      clients.map(async (c) => {
        const [day, week, month] = await Promise.all([
          getStatsByClientAndPeriod(c.id, dayRange.from, dayRange.to),
          getStatsByClientAndPeriod(c.id, weekRange.from, weekRange.to),
          getStatsByClientAndPeriod(c.id, monthRange.from, monthRange.to),
        ]);
        return { client: c, day, week, month };
      })
    );

    const totalDay = allStats.reduce(
      (a, s) => ({ count: a.count + s.day.count, totalCostUsd: a.totalCostUsd + s.day.totalCostUsd }),
      { count: 0, totalCostUsd: 0 }
    );
    const totalWeek = allStats.reduce(
      (a, s) => ({ count: a.count + s.week.count, totalCostUsd: a.totalCostUsd + s.week.totalCostUsd }),
      { count: 0, totalCostUsd: 0 }
    );
    const totalMonth = allStats.reduce(
      (a, s) => ({ count: a.count + s.month.count, totalCostUsd: a.totalCostUsd + s.month.totalCostUsd }),
      { count: 0, totalCostUsd: 0 }
    );

    const adminText =
      '<b>Общая по всем клиентам</b>\n' +
      `<b>Сводка за день</b>\nОпераций: ${totalDay.count}\nРасход: $${fmt(totalDay.totalCostUsd)}\n` +
      `\n<b>За неделю</b>\nОпераций: ${totalWeek.count}\nРасход: $${fmt(totalWeek.totalCostUsd)}\n` +
      `\n<b>За месяц</b>\nОпераций: ${totalMonth.count}\nРасход: $${fmt(totalMonth.totalCostUsd)}\n` +
      allStats
        .map(
          ({ client, day, week, month }) =>
            `\n<b>Клиент: ${escapeHtml(client.name)}</b>\n` +
            `День: ${day.count} операций, $${fmt(day.totalCostUsd)}` +
            (day.count > 0 ? ` (ср. $${fmt(day.avgCostUsd)})` : '') +
            `\nНеделя: ${week.count}, $${fmt(week.totalCostUsd)}` +
            (week.count > 0 ? ` (ср. $${fmt(week.avgCostUsd)})` : '') +
            `\nМесяц: ${month.count}, $${fmt(month.totalCostUsd)}` +
            (month.count > 0 ? ` (ср. $${fmt(month.avgCostUsd)})` : '') +
            '\n'
        )
        .join('');

    const adminMessage = errors?.length
      ? adminText + '\n\nОшибки:\n' + errors.slice(0, 5).map(escapeHtml).join('\n')
      : adminText;
    await notify(adminMessage);

    for (const { client } of allStats) {
      if (!client.notifyChatId?.trim()) continue;
      const [dayArticles, weekArticles, monthArticles] = await Promise.all([
        getArticleCountByClientAndPeriod(client.id, dayRange.from, dayRange.to),
        getArticleCountByClientAndPeriod(client.id, weekRange.from, weekRange.to),
        getArticleCountByClientAndPeriod(client.id, monthRange.from, monthRange.to),
      ]);
      const clientText =
        `<b>Сводка за сегодня</b>\n` +
        `Статей сгенерировано: за день — ${dayArticles}, за неделю — ${weekArticles}, за месяц — ${monthArticles}.`;
      await sendToChat(client.notifyChatId.trim(), clientText);
    }
  } else {
    const clientId = 'default';
    const [day, week, month] = await Promise.all([
      getStatsByClientAndPeriod(clientId, dayRange.from, dayRange.to),
      getStatsByClientAndPeriod(clientId, weekRange.from, weekRange.to),
      getStatsByClientAndPeriod(clientId, monthRange.from, monthRange.to),
    ]);
    let text =
      `<b>Сводка за день</b>\nОпераций: ${day.count}\nРасход: $${fmt(day.totalCostUsd)}` +
      (day.count > 0 ? `\nСредняя за операцию: $${fmt(day.avgCostUsd)}` : '');
    text +=
      `\n\n<b>За неделю</b>\nОпераций: ${week.count}\nРасход: $${fmt(week.totalCostUsd)}` +
      (week.count > 0 ? `\nСредняя: $${fmt(week.avgCostUsd)}` : '');
    text +=
      `\n\n<b>За месяц</b>\nОпераций: ${month.count}\nРасход: $${fmt(month.totalCostUsd)}` +
      (month.count > 0 ? `\nСредняя: $${fmt(month.avgCostUsd)}` : '');
    if (errors?.length) {
      text += '\n\nОшибки:\n' + errors.slice(0, 5).map(escapeHtml).join('\n');
    }
    await notify(text);
  }
}
