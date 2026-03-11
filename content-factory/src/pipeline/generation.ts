/**
 * Пайплайн генерации текста: заголовок → граундинг → черновик → очеловечивание → UTM → таблица (статус «Текст готов, ждём картинку»).
 * Картинка генерируется отдельно в imageGeneration.ts после generationTime (например 05:00).
 */
import { buildUtmUrl } from '../utils/utm';
import { groundArticleFacts } from '../ai/grounding';
import { generateDraft } from '../ai/draft';
import { humanize } from '../ai/humanize';
import { splitCostUsd } from '../ai/cost';
import { writeTextResult, updateStatus, setStatusError } from '../sheets/writer';
import { appendStatistics } from '../sheets/statistics';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
import { truncateAtSentence, cleanArticleFirstLine } from '../utils/text';
import type { Task } from '../types';
import type { Settings } from '../types';

export interface GenerationOptions {
  isRevision?: boolean;
  editorComment?: string;
  /** Не перезапускать генерацию картинки: после текста ставить «Готово к проверке», картинку не трогать. */
  keepImage?: boolean;
}

const MAX_HEADLINE_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;

export async function generationPipeline(
  task: Task,
  settings: Settings,
  options: GenerationOptions = {}
): Promise<void> {
  const { isRevision = false, editorComment, keepImage = false } = options;
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
    await updateStatus(task, 'Генерация');

    const keywords = (task.keywords ?? '')
      .split(/[,;]/)
      .map((s) => s.trim().slice(0, 500))
      .filter(Boolean);
    if (!keywords.length) keywords.push((task.keyword ?? '').slice(0, 500));

    const { facts, citations, usage: usageGround } = await withRetry(
      () => groundArticleFacts(headline, keywords, settings.groundingModel),
      'Grounding'
    );

    const { text: draftText, usage: usageDraft } = await withRetry(
      () =>
        generateDraft(
          headline,
          keywords,
          settings.prompt2,
          settings.role,
          facts,
          comment,
          settings.textModel
        ),
      'Draft'
    );

    const { text: finalText, usage: usageHumanize } = await withRetry(
      () =>
        humanize(
          draftText,
          settings.prompt3,
          settings.dnaBrandText,
          comment,
          settings.textModel
        ),
      'Humanize'
    );

    const cleanedText = cleanArticleFirstLine(finalText);
    if (cleanedText.length > 4000) {
      logInfo('Text exceeded 4000 chars, truncating', { len: cleanedText.length });
    }
    const previewText = truncateAtSentence(cleanedText, 4000);

    const utmUrl = buildUtmUrl(headline, settings, task.keyword ?? '');
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
      { statusAfter: keepImage ? 'Готово к проверке' : 'Текст готов, ждём картинку' }
    );

    const inputTokens =
      usageGround.prompt_tokens + usageDraft.prompt_tokens + usageHumanize.prompt_tokens;
    const outputTokens =
      usageGround.completion_tokens + usageDraft.completion_tokens + usageHumanize.completion_tokens;
    const statsModel =
      usageDraft.model || usageHumanize.model || usageGround.model || '—';
    await appendStatistics({
      headline: headline.slice(0, 200),
      inputTokens,
      outputTokens,
      model: statsModel,
      costTextUsd,
      costImageUsd: 0,
      costTotalUsd: costTextUsd,
      date: new Date().toISOString().slice(0, 10),
    }).catch(() => {});

    logInfo('Text generation done', { headline: headline.slice(0, 50), costTextUsd });
  } catch (error) {
    await setStatusError(task);
    throw error;
  }
}
