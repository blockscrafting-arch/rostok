/**
 * Пайплайн генерации картинки для статуса «Текст готов, ждём картинку».
 * Запускается после generationTime (например 05:00). Генерирует изображение → S3 → обновление H, L, M, E.
 */
import { generatePlantImage } from '../ai/image';
import { uploadImage } from '../storage/s3';
import { writeRegeneratedImage, setStatusError } from '../sheets/writer';
import { appendStatistics } from '../sheets/statistics';
import { withRetry } from '../utils/retry';
import { logInfo, logWarn } from '../utils/logger';
import { composeWithLogo } from '../utils/imageOverlay';
import type { Task } from '../types';
import type { Settings } from '../types';

const MAX_HEADLINE_LENGTH = 500;

export async function imageGenerationPipeline(task: Task, settings: Settings): Promise<void> {
  if (task.status !== 'Текст готов, ждём картинку') return;

  const headline = (task.headline?.trim() ?? '').slice(0, MAX_HEADLINE_LENGTH);
  if (!headline) {
    await setStatusError(task);
    throw new Error('Нет заголовка для генерации картинки');
  }

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
  logInfo('Image pipeline: calling API', {
    rowIndex: task.rowIndex,
    headline: headline.slice(0, 50),
    model: imageOptions.imageModel || '(from config)',
    hasReferencePhoto: !!referencePhotoUrl,
  });
  try {
    const imgResult = await withRetry(
      () => generatePlantImage(headline, referencePhotoUrl || undefined, imageOptions),
      'Image generation'
    );
    const costImageUsd = imgResult.costUsd ?? 0;
    let imageUrl = '';

    const rawImage = imgResult.imageUrl;
    const rawImageType = !rawImage
      ? 'empty'
      : rawImage.startsWith('data:image/')
        ? 'dataUrl'
        : rawImage.startsWith('http')
          ? 'http'
          : 'other';
    logInfo('Image pipeline: model response', {
      rowIndex: task.rowIndex,
      headline: headline.slice(0, 40),
      rawImageType,
      rawImageLength: rawImage?.length ?? 0,
      costUsd: costImageUsd,
    });

    if (rawImage) {
      let buf: Buffer;
      if (rawImage.startsWith('data:image/')) {
        const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, '');
        buf = Buffer.from(base64Data, 'base64');
        logInfo('Image pipeline: decoded base64', { rowIndex: task.rowIndex, bufBytes: buf.length });
      } else if (rawImage.startsWith('http')) {
        const resp = await fetch(rawImage);
        logInfo('Image pipeline: fetched image URL', {
          rowIndex: task.rowIndex,
          status: resp.status,
          ok: resp.ok,
        });
        if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
        else buf = Buffer.alloc(0);
        if (buf.length > 0) logInfo('Image pipeline: download size', { rowIndex: task.rowIndex, bufBytes: buf.length });
      } else {
        buf = Buffer.alloc(0);
        logWarn('Image pipeline: unknown rawImage format', { rowIndex: task.rowIndex, prefix: rawImage.slice(0, 30) });
      }
      if (buf.length > 0) {
        if (settings.logoUrl?.trim()) {
          const withLogo = await composeWithLogo(buf, settings.logoUrl.trim());
          if (withLogo) {
            buf = withLogo;
            logInfo('Image pipeline: logo applied', { rowIndex: task.rowIndex, bufBytes: buf.length });
          }
        }
        const key = `article-${task.rowIndex}-${Date.now()}.png`;
        logInfo('Image pipeline: uploading to S3', { rowIndex: task.rowIndex, key, bufBytes: buf.length });
        imageUrl = await withRetry(() => uploadImage(buf, key), 'S3');
        logInfo('Image pipeline: S3 result', { rowIndex: task.rowIndex, imageUrlLength: imageUrl?.length ?? 0 });
      } else {
        logWarn('Image pipeline: zero buffer after decode/fetch', { rowIndex: task.rowIndex, rawImageType });
      }
    }

    if (!imageUrl || !imageUrl.trim()) {
      logWarn('Image pipeline: failed (no imageUrl). See "Image API: no image in response" above for response structure.', {
        rowIndex: task.rowIndex,
        headline: headline.slice(0, 50),
        rawImageType: rawImageType ?? 'empty',
        rawImageLength: rawImage?.length ?? 0,
      });
      await setStatusError(task);
      throw new Error('Модель не вернула изображение или загрузка в S3 не удалась');
    }

    const nextStatus = settings.moderationEnabled ? 'Готово к проверке' : 'Одобрено на публикацию';
    await writeRegeneratedImage(task, imageUrl, costImageUsd, nextStatus);
    await appendStatistics({
      headline: headline.slice(0, 200),
      inputTokens: imgResult.usage?.prompt_tokens ?? 0,
      outputTokens: imgResult.usage?.completion_tokens ?? 0,
      model: imgResult.usage?.model ?? '—',
      costTextUsd: 0,
      costImageUsd,
      costTotalUsd: costImageUsd,
      date: new Date().toISOString().slice(0, 10),
    }).catch(() => {});
    logInfo('Image generation done', { headline: headline.slice(0, 50), rowIndex: task.rowIndex });
  } catch (e) {
    await setStatusError(task);
    throw e;
  }
}
