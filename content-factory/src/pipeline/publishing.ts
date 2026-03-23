/**
 * Пайплайн: одобренная статья → публикация в Telegram → статус «Опубликовано» + ссылка на пост.
 */
import { publishToChannel } from '../telegram/publisher';
import { notify } from '../telegram/notifier';
import { writePublished, setStatusError } from '../sheets/writer';
import { withRetry } from '../utils/retry';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import { markdownToTelegramHtml } from '../utils/markdownToHtml';
import type { SheetTask, PipelineContext } from '../types';

const MAX_TEXT_LENGTH = 4096;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Текст уведомления о публикации: без битой ссылки, если postUrl пустой (часть числовых chat_id). */
export function formatPublishNotifyHtml(postUrl: string, headlineSafe: string): string {
  const url = postUrl.trim();
  if (url) {
    return `Опубликовано: <a href="${escapeHtml(url)}">${headlineSafe}</a>`;
  }
  return `Опубликовано: ${headlineSafe} (публичная ссылка на пост недоступна для этого chat_id)`;
}

export async function publishingPipeline(task: SheetTask, context?: PipelineContext): Promise<void> {
  const sheetCtx = context?.sheetContext;
  const telegramChannelId = context?.telegramChannelId;
  const telegramBotToken = context?.telegramBotToken;
  const cid = context?.clientId?.trim();
  /** Легаси / одна таблица: только тогда разрешён канал из TELEGRAM_CHANNEL_ID в .env. */
  const allowConfigChannelFallback = !cid || cid === 'default';

  if (task.status !== 'Одобрено на публикацию') return;

  const text = task.previewText?.trim();
  if (!text) {
    await setStatusError(task, sheetCtx);
    throw new Error('Нет текста для публикации');
  }

  const raw = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  const toPublish = markdownToTelegramHtml(raw);

  try {
    const { postUrl } = await withRetry(
      () =>
        publishToChannel(toPublish, telegramChannelId, telegramBotToken, {
          allowConfigChannelFallback,
        }),
      'Telegram publish'
    );
    await writePublished(task, postUrl, sheetCtx);
    logInfo('Published', { postUrl, headline: task.headline?.slice(0, 50) });
    const headlineSafe = escapeHtml((task.headline ?? '').slice(0, 60));
    try {
      await notify(formatPublishNotifyHtml(postUrl, headlineSafe));
    } catch (notifyErr) {
      logWarn('Published to channel but Telegram notify failed', serializeError(notifyErr));
    }
  } catch (error) {
    await setStatusError(task, sheetCtx);
    throw error;
  }
}
