/**
 * Инлайн «Присвоить OpenRouter ключ» под уведомлением о новом клиенте:
 * callback → ждём текст ключа → prisma.clients.openrouterApiKey.
 */
import { Markup } from 'telegraf';
import { appBot } from './appBot';
import { config } from '../config';
import { logInfo, logWarn } from '../utils/logger';
import { getClientById, updateClient } from '../db/repositories/clients';
import { invalidateClientSettingsCache } from '../workers/loadJobData';
import {
  buildAssignOpenRouterCallbackData,
  isPlausibleOpenRouterKey,
  OPENROUTER_KEY_CALLBACK_PREFIX,
} from './openRouterKeyUtils';

function getNotifyChatIds(): string[] {
  return config.telegram.notifyChatId
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function sessionKey(chatId: number | undefined, userId: number | undefined): string {
  return `${chatId ?? 0}:${userId ?? 0}`;
}

interface PendingKeyInput {
  clientId: string;
  /** Время истечения ожидания (unix ms) */
  expiresAt: number;
}

const pendingBySession = new Map<string, PendingKeyInput>();

const PENDING_TTL_MS = 15 * 60 * 1000;

/** Повторный вызов register* в dev/hot-reload дублировал бы ответы — защита однократной регистрации. */
let handlersRegistered = false;

function canAssignOpenRouterKey(chatId: number | undefined, userId: number | undefined): boolean {
  if (userId == null || chatId == null) return false;
  const admins = config.telegram.adminUserIds;
  if (admins.length > 0) {
    return admins.includes(userId);
  }
  const chatStr = String(chatId);
  return getNotifyChatIds().some((nid) => nid === chatStr);
}

function maskKeyHint(key: string): string {
  const t = key.trim();
  if (t.length < 12) return '***';
  return `${t.slice(0, 7)}…${t.slice(-4)}`;
}

export function registerAdminOpenRouterKeyHandlers(): void {
  if (handlersRegistered) {
    return;
  }
  handlersRegistered = true;

  const admins = config.telegram.adminUserIds;
  if (admins.length === 0) {
    logWarn(
      'TELEGRAM_ADMIN_USER_IDS пуст: кнопку «Присвоить ключ» может нажать любой участник чата из TELEGRAM_NOTIFY_CHAT_ID. Задайте numeric user id через запятую для ограничения доступа.'
    );
  }

  appBot.action(
    new RegExp(
      `^${OPENROUTER_KEY_CALLBACK_PREFIX}([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$`,
      'i'
    ),
    async (ctx) => {
      const clientId = ctx.match[1];
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      if (!canAssignOpenRouterKey(chatId, userId)) {
        await ctx.answerCbQuery({ text: 'Нет доступа', show_alert: true });
        return;
      }
      await ctx.answerCbQuery();

      const client = await getClientById(clientId);
      if (!client) {
        await ctx.reply('Клиент не найден в БД.');
        return;
      }

      const sk = sessionKey(chatId, userId);
      pendingBySession.set(sk, { clientId, expiresAt: Date.now() + PENDING_TTL_MS });

      await ctx.reply(
        [
          `Клиент: <b>${escapeHtml(client.name)}</b>`,
          `ID: <code>${escapeHtml(clientId)}</code>`,
          '',
          'Отправьте <b>одним сообщением</b> API-ключ OpenRouter (начинается с <code>sk-or-</code>).',
          'Отмена: /cancel_ork',
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
    }
  );

  appBot.command('cancel_ork', async (ctx) => {
    const key = sessionKey(ctx.chat?.id, ctx.from?.id);
    if (pendingBySession.delete(key)) {
      await ctx.reply('Ввод ключа отменён.');
    }
  });

  appBot.on('text', async (ctx, next) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) {
      return next();
    }
    const key = sessionKey(ctx.chat?.id, ctx.from?.id);
    const pending = pendingBySession.get(key);
    if (!pending) {
      return next();
    }
    if (!canAssignOpenRouterKey(ctx.chat?.id, ctx.from?.id)) {
      pendingBySession.delete(key);
      return next();
    }
    if (Date.now() > pending.expiresAt) {
      pendingBySession.delete(key);
      await ctx.reply('Время ожидания ключа истекло. Нажмите кнопку в уведомлении снова.');
      return;
    }

    if (!isPlausibleOpenRouterKey(text)) {
      await ctx.reply(
        'Ключ не похож на OpenRouter (ожидается строка вида sk-or-…). Попробуйте снова или /cancel_ork'
      );
      return;
    }

    const apiKey = text.trim();
    try {
      const client = await getClientById(pending.clientId);
      if (!client) {
        pendingBySession.delete(key);
        await ctx.reply('Клиент больше не найден.');
        return;
      }
      await updateClient(pending.clientId, { openrouterApiKey: apiKey });
      invalidateClientSettingsCache(pending.clientId);
      pendingBySession.delete(key);
      logInfo('OpenRouter key assigned via Telegram', {
        clientId: pending.clientId,
        clientName: client.name,
        keyHint: maskKeyHint(apiKey),
      });
      await ctx.reply(
        [
          '✅ Ключ сохранён в БД.',
          `Клиент: <b>${escapeHtml(client.name)}</b>`,
          `Проверка: <code>${escapeHtml(maskKeyHint(apiKey))}</code>`,
        ].join('\n'),
        { parse_mode: 'HTML' }
      );
    } catch (e) {
      logWarn('Failed to save OpenRouter key from Telegram', {
        clientId: pending.clientId,
        error: e instanceof Error ? e.message : String(e),
      });
      await ctx.reply('Ошибка записи в БД. Попробуйте позже.');
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
 * Кнопка под уведомлением о новом клиенте (если известен clientId).
 */
export function assignOpenRouterKeyReplyMarkup(clientId: string) {
  return Markup.inlineKeyboard([
    Markup.button.callback('Присвоить OpenRouter ключ', buildAssignOpenRouterCallbackData(clientId)),
  ]);
}
