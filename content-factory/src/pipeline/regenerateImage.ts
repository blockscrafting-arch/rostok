/**
 * Пайплайн «Перегенерировать картинку»: только изображение по заголовку и Справочнику фото → S3 → обновление H, L, M, E.
 */
import { generatePlantImage } from '../ai/image';
import { uploadImage } from '../storage/s3';
import { writeRegeneratedImage, setStatusError } from '../sheets/writer';
import { withRetry } from '../utils/retry';
import { logInfo, logWarn } from '../utils/logger';
import { composeWithLogo } from '../utils/imageOverlay';
import type { Task } from '../types';
import type { Settings } from '../types';

const MAX_HEADLINE_LENGTH = 500;

export async function regenerateImagePipeline(task: Task, settings: Settings): Promise<void> {
  const headline = (task.headline?.trim() ?? '').slice(0, MAX_HEADLINE_LENGTH);
  if (!headline) {
    await setStatusError(task);
    throw new Error('Нет заголовка для перегенерации картинки');
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
  try {
    const imgResult = await withRetry(
      () => generatePlantImage(headline, referencePhotoUrl || undefined, imageOptions),
      'Regenerate image'
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
    logInfo('RegenerateImage pipeline: model response', {
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
        logInfo('RegenerateImage pipeline: decoded base64', { rowIndex: task.rowIndex, bufBytes: buf.length });
      } else if (rawImage.startsWith('http')) {
        const resp = await fetch(rawImage);
        logInfo('RegenerateImage pipeline: fetched image URL', {
          rowIndex: task.rowIndex,
          status: resp.status,
          ok: resp.ok,
        });
        if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
        else buf = Buffer.alloc(0);
        if (buf.length > 0) logInfo('RegenerateImage pipeline: download size', { rowIndex: task.rowIndex, bufBytes: buf.length });
      } else {
        buf = Buffer.alloc(0);
        logWarn('RegenerateImage pipeline: unknown rawImage format', { rowIndex: task.rowIndex, prefix: rawImage.slice(0, 30) });
      }
      if (buf.length > 0) {
        if (settings.logoUrl?.trim()) {
          const withLogo = await composeWithLogo(buf, settings.logoUrl.trim());
          if (withLogo) {
            buf = withLogo;
            logInfo('RegenerateImage pipeline: logo applied', { rowIndex: task.rowIndex, bufBytes: buf.length });
          }
        }
        const key = `article-${task.rowIndex}-${Date.now()}.png`;
        logInfo('RegenerateImage pipeline: uploading to S3', { rowIndex: task.rowIndex, key, bufBytes: buf.length });
        imageUrl = await withRetry(() => uploadImage(buf, key), 'S3');
        logInfo('RegenerateImage pipeline: S3 result', { rowIndex: task.rowIndex, imageUrlLength: imageUrl?.length ?? 0 });
      } else {
        logWarn('RegenerateImage pipeline: zero buffer after decode/fetch', { rowIndex: task.rowIndex, rawImageType });
      }
    }

    if (!imageUrl || !imageUrl.trim()) {
      logWarn('RegenerateImage pipeline: failed (no imageUrl)', {
        rowIndex: task.rowIndex,
        headline: headline.slice(0, 50),
        rawImageType: rawImageType ?? 'empty',
        rawImageLength: rawImage?.length ?? 0,
      });
      await setStatusError(task);
      throw new Error('Модель не вернула изображение или загрузка в S3 не удалась');
    }

    await writeRegeneratedImage(task, imageUrl, costImageUsd, 'Готово к проверке');
    logInfo('Regenerated image', { headline: headline.slice(0, 50), rowIndex: task.rowIndex });
  } catch (e) {
    await setStatusError(task);
    throw e;
  }
}
