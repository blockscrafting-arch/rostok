/**
 * Наложение логотипа на изображение (нижний правый угол). При ошибке возвращает null — вызывающий код продолжает без логотипа.
 */
import sharp from 'sharp';
import { logWarn } from './logger';

const LOGO_MAX_FRACTION = 0.2; // логотип не более 20% от меньшей стороны основы
const PADDING_PX = 16;

/**
 * Скачать изображение по URL в буфер.
 */
async function fetchImageBuffer(url: string): Promise<Buffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

/**
 * Наложить логотип на основное изображение (нижний правый угол). При любой ошибке возвращает null.
 */
export async function composeWithLogo(baseBuffer: Buffer, logoUrl: string): Promise<Buffer | null> {
  try {
    const logoBuffer = await fetchImageBuffer(logoUrl);
    const base = sharp(baseBuffer);
    const baseMeta = await base.metadata();
    const width = baseMeta.width ?? 1024;
    const height = baseMeta.height ?? 1024;
    const logoSize = Math.min(width, height) * LOGO_MAX_FRACTION;

    const logoResized = await sharp(logoBuffer)
      .resize(Math.round(logoSize), Math.round(logoSize), { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoResized).metadata();
    const lw = logoMeta.width ?? 0;
    const lh = logoMeta.height ?? 0;
    const left = Math.max(0, width - lw - PADDING_PX);
    const top = Math.max(0, height - lh - PADDING_PX);

    const out = await base
      .composite([{ input: logoResized, left, top }])
      .png()
      .toBuffer();
    return out;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    logWarn('Logo overlay failed, using image without logo', { logoUrl, error: err });
    return null;
  }
}
