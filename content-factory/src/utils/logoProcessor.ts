/**
 * После онбординга: скачать лого, при необходимости снять фон (remove.bg), залить PNG в S3, обновить logoUrl в БД и в листе.
 * Вызывается без await — не блокирует ответ 201.
 */
import sharp from 'sharp';
import { prisma } from '../db/client';
import { config } from '../config';
import { uploadImage } from '../storage/s3';
import { convertDriveUrlToDirectDownload } from './url';
import { isFetchUrlAllowed } from './urlAllowlist';
import { logInfo, logWarn, serializeError } from './logger';
import { syncLogoUrlOnlyToSettingsSheet } from '../sheets/settingsWriter';
import { invalidateClientSettingsCache } from '../workers/loadJobData';

const URL_PREVIEW_MAX = 180;

/** Безопасное превью URL для логов (обрезка, без полного query при длине). */
function logoUrlPreview(url: string): string {
  const s = url.trim();
  if (s.length <= URL_PREVIEW_MAX) return s;
  return `${s.slice(0, URL_PREVIEW_MAX)}…`;
}

async function fetchLogoBuffer(url: string, clientId: string): Promise<Buffer> {
  const direct = convertDriveUrlToDirectDownload(url.trim());
  if (!isFetchUrlAllowed(direct)) {
    let host = '';
    try {
      host = new URL(direct).hostname;
    } catch {
      /* ignore */
    }
    logWarn('Logo: fetch blocked by allowlist', {
      clientId,
      urlPreview: logoUrlPreview(direct),
      host: host || undefined,
    });
    throw new Error('Logo URL not allowed for fetch (SSRF protection)');
  }
  logInfo('Logo: fetching', { clientId, urlPreview: logoUrlPreview(direct) });
  const r = await fetch(direct);
  const contentType = r.headers.get('content-type') ?? undefined;
  if (!r.ok) {
    logWarn('Logo: fetch HTTP error', {
      clientId,
      status: r.status,
      contentType,
      urlPreview: logoUrlPreview(direct),
    });
    throw new Error(`Logo fetch HTTP ${r.status}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  logInfo('Logo: fetched', {
    clientId,
    bytes: buf.length,
    contentType,
  });
  return buf;
}

/**
 * Есть ли реальная прозрачность (альфа < 255 хотя бы в одном пикселе).
 * Работает для RGBA и grayscale+alpha (GA) форматов.
 */
async function imageHasTransparentPixels(buf: Buffer): Promise<boolean> {
  const [meta, stats] = await Promise.all([sharp(buf).metadata(), sharp(buf).stats()]);
  if (!meta.hasAlpha) return false;
  // RGBA → 4 канала (alpha = 3), GA → 2 канала (alpha = 1), RGB → нет alpha
  const alphaIdx = stats.channels.length - 1;
  const alpha = stats.channels[alphaIdx];
  if (!alpha) return false;
  return alpha.min < 255;
}

/** Метаданные исходного изображения для логов (один проход sharp.metadata). */
async function logoImageMetaForLog(buf: Buffer): Promise<{
  format?: string;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
}> {
  const meta = await sharp(buf).metadata();
  return {
    format: meta.format,
    width: meta.width,
    height: meta.height,
    hasAlpha: meta.hasAlpha,
  };
}

async function removeBackgroundWithRemoveBg(buf: Buffer, clientId: string): Promise<Buffer> {
  const key = config.removeBg.apiKey?.trim();
  if (!key) {
    throw new Error('REMOVE_BG_API_KEY not set');
  }
  // Всегда конвертируем в PNG перед отправкой: remove.bg ожидает соответствие
  // MIME-типа реальному формату. Исходный buf может быть JPEG или WebP.
  const pngBuf = await sharp(buf).png().toBuffer();
  logInfo('Logo: remove.bg request prepared', {
    clientId,
    inputBytes: buf.length,
    pngBytesForApi: pngBuf.length,
  });
  const form = new FormData();
  form.append('image_file', new Blob([new Uint8Array(pngBuf)], { type: 'image/png' }), 'logo.png');
  form.append('size', 'regular');
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logWarn('Logo: remove.bg error response', {
      clientId,
      status: res.status,
      bodyPreview: errText.slice(0, 400),
    });
    throw new Error(`remove.bg ${res.status}: ${errText.slice(0, 300)}`);
  }
  const out = Buffer.from(await res.arrayBuffer());
  logInfo('Logo: remove.bg ok', { clientId, outputBytes: out.length });
  return out;
}

/**
 * Обрезать прозрачные края (trim) и вернуть PNG.
 * trim() применяется только если в буфере есть alpha-канал — иначе он обрезает
 * пиксели, совпадающие с угловым пикселем, что уничтожит содержимое без фона.
 */
async function toTrimmedPng(buf: Buffer, clientId: string, label: string): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const trimmed = Boolean(meta.hasAlpha);
  if (trimmed) {
    const out = await sharp(buf).trim({ threshold: 5, lineArt: true }).png().toBuffer();
    logInfo('Logo: PNG trim', {
      clientId,
      label,
      trimmed: true,
      inBytes: buf.length,
      outBytes: out.length,
    });
    return out;
  }
  const out = await sharp(buf).png().toBuffer();
  logInfo('Logo: PNG encode (no trim, no alpha)', {
    clientId,
    label,
    inBytes: buf.length,
    outBytes: out.length,
  });
  return out;
}

/**
 * Скачать лого по URL, обработать, залить в S3, обновить client_settings и лист «Настройки».
 * Ошибки логируются; исходный logoUrl в БД не трогаем при сбое.
 */
export async function processAndPersistOnboardingLogo(
  clientId: string,
  logoUrl: string | null | undefined,
  spreadsheetId: string | null | undefined
): Promise<void> {
  const url = logoUrl?.trim();
  if (!url) return;

  let stage = 'start';
  try {
    const sid = spreadsheetId?.trim();
    logInfo('Logo: pipeline started', {
      clientId,
      urlPreview: logoUrlPreview(url),
      hasSpreadsheetId: Boolean(sid),
      hasRemoveBgKey: Boolean(config.removeBg.apiKey?.trim()),
      hasS3Keys: Boolean(config.s3.accessKey?.trim() && config.s3.secretKey?.trim()),
    });

    stage = 'fetch';
    const raw = await fetchLogoBuffer(url, clientId);
    const rawMeta = await logoImageMetaForLog(raw);
    logInfo('Logo: raw image meta', { clientId, ...rawMeta, bytes: raw.length });

    let processed: Buffer;

    stage = 'transparency_check';
    const hasRealTransparency = await imageHasTransparentPixels(raw);
    logInfo('Logo: transparency check', {
      clientId,
      hasRealTransparency,
      declaredAlpha: rawMeta.hasAlpha,
    });

    if (hasRealTransparency) {
      stage = 'trim_transparent';
      logInfo('Logo: branch skip remove.bg (already transparent)', { clientId });
      processed = await toTrimmedPng(raw, clientId, 'raw_transparent');
    } else if (config.removeBg.apiKey?.trim()) {
      stage = 'remove_bg';
      logInfo('Logo: branch remove.bg', { clientId });
      const noBg = await removeBackgroundWithRemoveBg(raw, clientId);
      stage = 'trim_after_remove_bg';
      processed = await toTrimmedPng(noBg, clientId, 'after_remove_bg');
    } else {
      stage = 'trim_no_api';
      logWarn('Logo: REMOVE_BG_API_KEY empty, uploading without background removal', { clientId });
      processed = await toTrimmedPng(raw, clientId, 'raw_no_remove_bg');
    }

    stage = 's3_check';
    if (!config.s3.accessKey?.trim() || !config.s3.secretKey?.trim()) {
      logWarn('Logo: S3 credentials missing, skip persist', {
        clientId,
        processedBytes: processed.length,
      });
      return;
    }

    stage = 's3_upload';
    const objectKey = `clients/${clientId}/logo-${Date.now()}.png`;
    logInfo('Logo: S3 upload starting', { clientId, objectKey, bytes: processed.length });
    const s3Url = await uploadImage(processed, objectKey);

    stage = 'db_update';
    await prisma.clientSettings.update({
      where: { clientId },
      data: { logoUrl: s3Url },
    });
    invalidateClientSettingsCache(clientId);
    logInfo('Logo: DB client_settings.logoUrl updated', { clientId, s3UrlPreview: logoUrlPreview(s3Url) });

    if (sid) {
      stage = 'sheet_sync';
      await syncLogoUrlOnlyToSettingsSheet(sid, s3Url);
      logInfo('Logo: settings sheet logo URL synced', { clientId, spreadsheetIdPreview: sid.slice(0, 16) });
    } else {
      logInfo('Logo: no spreadsheetId, sheet sync skipped', { clientId });
    }

    logInfo('Logo: pipeline completed', { clientId, s3UrlPreview: logoUrlPreview(s3Url) });
  } catch (e) {
    const ser = serializeError(e);
    logWarn('Logo: pipeline failed, keeping original logoUrl', {
      clientId,
      stage,
      urlPreview: logoUrlPreview(url),
      errorMessage: ser.message,
      stack: ser.stack,
    });
  }
}
