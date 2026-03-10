/**
 * Пайплайн: заголовок → граундинг → черновик → очеловечивание → UTM → картинка → S3 → таблица.
 */
import { buildUtmUrl } from '../utils/utm';
import { groundArticleFacts } from '../ai/grounding';
import { generateDraft } from '../ai/draft';
import { humanize } from '../ai/humanize';
import { generatePlantImage } from '../ai/image';
import { uploadImage } from '../storage/s3';
import { splitCostUsd } from '../ai/cost';
import { writeGenerationResult, updateStatus, setStatusError } from '../sheets/writer';
import { appendStatistics } from '../sheets/statistics';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
import { truncateAtSentence } from '../utils/text';
import type { Task } from '../types';
import type { Settings } from '../types';
import type { ArticleResult } from '../types';

export interface GenerationOptions {
  isRevision?: boolean;
  editorComment?: string;
}

const MAX_HEADLINE_LENGTH = 500;
const MAX_COMMENT_LENGTH = 2000;

export async function generationPipeline(
  task: Task,
  settings: Settings,
  options: GenerationOptions = {}
): Promise<void> {
  const { isRevision = false, editorComment } = options;
  const headline = (task.headline?.trim() ?? '').slice(0, MAX_HEADLINE_LENGTH);
  if (!headline || (task.status !== 'Согласовано' && task.status !== 'На доработку')) return;

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

    if (finalText.length > 4000) {
      logInfo('Text exceeded 4000 chars, truncating', { len: finalText.length });
    }
    const previewText = truncateAtSentence(finalText, 4000);

    const utmUrl = buildUtmUrl(headline, settings, task.keyword ?? '');
    const textUsages = [usageGround, usageDraft, usageHumanize];

    let imageUrl = '';
    let costImageUsd = 0;
    const referencePhotoMap = settings.referencePhotoMap ?? {};
    const headlineLower = headline.toLowerCase();
    let referencePhotoUrl = '';
    for (const [section, url] of Object.entries(referencePhotoMap)) {
      if (section && url && headlineLower.includes(section.toLowerCase())) {
        referencePhotoUrl = url;
        break;
      }
    }
    if (!referencePhotoUrl && Object.keys(referencePhotoMap).length > 0) {
      referencePhotoUrl = Object.values(referencePhotoMap)[0] ?? '';
    }
    const imageOptions = {
      promptImage: settings.promptImage,
      promptImageWithReference: settings.promptImageWithReference,
      imageModel: settings.imageModel,
    };
    try {
      const imgResult = await withRetry(
        () => generatePlantImage(headline, referencePhotoUrl || undefined, imageOptions),
        'Image'
      );
      if (imgResult.costUsd) costImageUsd = imgResult.costUsd;
      
      const rawImage = imgResult.imageUrl;
      if (rawImage) {
        if (rawImage.startsWith('data:image/')) {
          // Обработка Base64
          const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, '');
          const buf = Buffer.from(base64Data, 'base64');
          const key = `article-${task.rowIndex}-${Date.now()}.png`;
          imageUrl = await withRetry(() => uploadImage(buf, key), 'S3');
        } else if (rawImage.startsWith('http')) {
          // Обработка прямой ссылки
          const resp = await fetch(rawImage);
          if (resp.ok) {
            const buf = Buffer.from(await resp.arrayBuffer());
            const key = `article-${task.rowIndex}-${Date.now()}.png`;
            imageUrl = await withRetry(() => uploadImage(buf, key), 'S3');
          }
        }
      }
    } catch (e) {
      logInfo('Image generation or upload failed, continuing without image', { error: e });
    }

    const { costTextUsd, costImageUsd: costImgUsd, costTotalUsd } = splitCostUsd(textUsages, costImageUsd);

    const result: ArticleResult = {
      previewText,
      sources: citations.join(', '),
      imageUrl,
      utmUrl,
      costTextUsd,
      costImageUsd: costImgUsd,
      costTotalUsd,
    };
    const nextStatus = settings.moderationEnabled ? 'Готово к проверке' : 'Одобрено';
    await writeGenerationResult(task, result, nextStatus);

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
      costImageUsd: costImgUsd,
      costTotalUsd,
      date: new Date().toISOString().slice(0, 10),
    }).catch(() => {});

    logInfo('Generation done', { headline: headline.slice(0, 50), costTotalUsd });
  } catch (error) {
    await setStatusError(task);
    throw error;
  }
}
