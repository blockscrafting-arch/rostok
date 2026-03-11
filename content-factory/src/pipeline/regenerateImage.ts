/**
 * Пайплайн «Перегенерировать картинку»: только изображение по заголовку и Справочнику фото → S3 → обновление H, L, M, E.
 */
import { generatePlantImage } from '../ai/image';
import { uploadImage } from '../storage/s3';
import { writeRegeneratedImage, setStatusError } from '../sheets/writer';
import { withRetry } from '../utils/retry';
import { logInfo } from '../utils/logger';
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
    if (rawImage) {
      let buf: Buffer;
      if (rawImage.startsWith('data:image/')) {
        const base64Data = rawImage.replace(/^data:image\/\w+;base64,/, '');
        buf = Buffer.from(base64Data, 'base64');
      } else if (rawImage.startsWith('http')) {
        const resp = await fetch(rawImage);
        if (resp.ok) buf = Buffer.from(await resp.arrayBuffer());
        else buf = Buffer.alloc(0);
      } else {
        buf = Buffer.alloc(0);
      }
      if (buf.length > 0) {
        if (settings.logoUrl?.trim()) {
          const withLogo = await composeWithLogo(buf, settings.logoUrl.trim());
          if (withLogo) buf = withLogo;
        }
        const key = `article-${task.rowIndex}-${Date.now()}.png`;
        imageUrl = await withRetry(() => uploadImage(buf, key), 'S3');
      }
    }

    if (!imageUrl || !imageUrl.trim()) {
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
