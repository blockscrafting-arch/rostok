/**
 * Пайплайн: одобренная статья → публикация в Telegram → статус «Опубликовано» + ссылка на пост.
 */
import { publishToChannel } from '../telegram/publisher';
import { notify } from '../telegram/notifier';
import { writePublished, setStatusError } from '../sheets/writer';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
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

export async function publishingPipeline(task: SheetTask, context?: PipelineContext): Promise<void> {
  const sheetCtx = context?.sheetContext;
  const telegramChannelId = context?.telegramChannelId;

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
      () => publishToChannel(toPublish, telegramChannelId),
      'Telegram publish'
    );
    await writePublished(task, postUrl, sheetCtx);
    const headlineSafe = escapeHtml((task.headline ?? '').slice(0, 60));
    await notify(`Опубликовано: <a href="${escapeHtml(postUrl)}">${headlineSafe}</a>`);
    logInfo('Published', { postUrl, headline: task.headline?.slice(0, 50) });
  } catch (error) {
    await setStatusError(task, sheetCtx);
    throw error;
  }
}
