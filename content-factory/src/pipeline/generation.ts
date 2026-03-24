/**
 * Пайплайн генерации текста: заголовок → граундинг → черновик → очеловечивание → UTM → таблица (статус «Готово к проверке»).
 * Картинка — только после того, как менеджер поставит «Текст готов, ждём картинку» (см. scheduler + imageGeneration.ts).
 */
import { buildUtmUrl } from '../utils/utm';
import { groundArticleFacts } from '../ai/grounding';
import { generateDraft } from '../ai/draft';
import { humanize } from '../ai/humanize';
import { openrouter } from '../ai/client';
import { splitCostUsd } from '../ai/cost';
import { writeTextResult, updateStatus, setStatusError } from '../sheets/writer';
import { createCostRecord } from '../db/repositories/costRecords';
import { withRetry } from '../utils/retry';
import { logInfo, logWarn, serializeError } from '../utils/logger';
import { truncateAtSentence, cleanArticleFirstLine, insertCatalogLinks } from '../utils/text';
import type { SheetTask, Settings, PipelineContext } from '../types';

export interface GenerationOptions {
  isRevision?: boolean;
  editorComment?: string;
}

const MAX_HEADLINE_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;

export async function generationPipeline(
  task: SheetTask,
  settings: Settings,
  options: GenerationOptions = {},
  context?: PipelineContext
): Promise<void> {
  const { isRevision = false, editorComment } = options;
  const aiClient = context?.aiClient ?? openrouter;
  const sheetCtx = context?.sheetContext;

  const headline = (task.headline?.trim() ?? '').slice(0, MAX_HEADLINE_LENGTH);
  if (
    !headline ||
    (task.status !== 'Согласован заголовок' &&
      task.status !== 'На доработку' &&
      task.status !== 'Перегенерировать текст')
  )
    return;

  const comment = ((editorComment ?? task.comment ?? '') as string).slice(0, MAX_COMMENT_LENGTH) || undefined;

  try {
    await updateStatus(task, 'Генерация', sheetCtx);

    const keywords = (task.keywords ?? '')
      .split(/[,;]/)
      .map((s) => s.trim().slice(0, 500))
      .filter(Boolean);
    if (!keywords.length) keywords.push((task.keyword ?? '').slice(0, 500));

    const { facts, citations, usage: usageGround } = await withRetry(
      () =>
        groundArticleFacts(aiClient, headline, keywords, {
          modelOverride: settings.groundingModel,
        }),
      'Grounding'
    );

    const { text: draftText, usage: usageDraft } = await withRetry(
      () =>
        generateDraft(
          aiClient,
          headline,
          keywords,
          settings.prompt2,
          settings,
          facts,
          comment,
          settings.textModel
        ),
      'Draft'
    );

    const { text: finalText, usage: usageHumanize } = await withRetry(
      () =>
        humanize(
          aiClient,
          draftText,
          settings.prompt3,
          settings.dnaBrandText,
          comment,
          settings.textModel
        ),
      'Humanize'
    );

    const cleanedText = cleanArticleFirstLine(finalText);
    const utmUrl = buildUtmUrl(headline, settings, task.keyword ?? '');
    const textWithLinks = insertCatalogLinks(cleanedText, utmUrl);
    if (textWithLinks.length > 4000) {
      logInfo('Text exceeded 4000 chars, truncating', { len: textWithLinks.length });
    }
    const previewText = truncateAtSentence(textWithLinks, 4000);
    const textUsages = [usageGround, usageDraft, usageHumanize];
    const { costTextUsd } = splitCostUsd(textUsages, 0);

    await writeTextResult(
      task,
      {
        previewText,
        sources: citations.join(', '),
        utmUrl,
        costTextUsd,
      },
      { statusAfter: 'Готово к проверке' },
      sheetCtx
    );

    const inputTokens =
      usageGround.prompt_tokens + usageDraft.prompt_tokens + usageHumanize.prompt_tokens;
    const outputTokens =
      usageGround.completion_tokens + usageDraft.completion_tokens + usageHumanize.completion_tokens;
    const statsModel = [usageGround.model, usageDraft.model, usageHumanize.model]
      .filter(Boolean)
      .join(' + ') || '—';
    await createCostRecord({
      clientId: context?.clientId || 'default',
      operation: 'text',
      model: statsModel,
      inputTokens,
      outputTokens,
      costUsd: costTextUsd,
    }).catch((e) => {
      logWarn('Cost record write failed', { headline: headline.slice(0, 50), errorMessage: serializeError(e).message });
    });

    logInfo('Text generation done', { headline: headline.slice(0, 50), costTextUsd });
  } catch (error) {
    await setStatusError(task, sheetCtx);
    throw error;
  }
}
