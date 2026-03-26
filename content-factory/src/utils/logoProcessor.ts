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

async function fetchLogoBuffer(url: string): Promise<Buffer> {
  const direct = convertDriveUrlToDirectDownload(url.trim());
  if (!isFetchUrlAllowed(direct)) {
    throw new Error('Logo URL not allowed for fetch (SSRF protection)');
  }
  const r = await fetch(direct);
  if (!r.ok) {
    throw new Error(`Logo fetch HTTP ${r.status}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

/** Есть ли реальная прозрачность (альфа < 255 хотя бы в одном пикселе). */
async function imageHasTransparentPixels(buf: Buffer): Promise<boolean> {
  const meta = await sharp(buf).metadata();
  if (!meta.hasAlpha) return false;
  const stats = await sharp(buf).stats();
  const alpha = stats.channels[3];
  if (!alpha) return false;
  return alpha.min < 255;
}

async function removeBackgroundWithRemoveBg(buf: Buffer): Promise<Buffer> {
  const key = config.removeBg.apiKey?.trim();
  if (!key) {
    throw new Error('REMOVE_BG_API_KEY not set');
  }
  const form = new FormData();
  form.append('image_file', new Blob([new Uint8Array(buf)], { type: 'image/png' }), 'logo.png');
  form.append('size', 'regular');
  const res = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': key },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`remove.bg ${res.status}: ${errText.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function toTrimmedPng(buf: Buffer): Promise<Buffer> {
  return sharp(buf).trim({ threshold: 5, lineArt: true }).png().toBuffer();
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

  try {
    const raw = await fetchLogoBuffer(url);
    let processed: Buffer;

    if (await imageHasTransparentPixels(raw)) {
      logInfo('Logo: transparency detected, skip remove.bg', { clientId });
      processed = await toTrimmedPng(raw);
    } else if (config.removeBg.apiKey?.trim()) {
      logInfo('Logo: calling remove.bg', { clientId });
      const noBg = await removeBackgroundWithRemoveBg(raw);
      processed = await toTrimmedPng(noBg);
    } else {
      logWarn('Logo: REMOVE_BG_API_KEY empty, uploading to S3 without background removal', { clientId });
      processed = await toTrimmedPng(raw);
    }

    if (!config.s3.accessKey?.trim() || !config.s3.secretKey?.trim()) {
      logWarn('Logo: S3 credentials missing, skip persist', { clientId });
      return;
    }

    const s3Url = await uploadImage(processed, `clients/${clientId}/logo-${Date.now()}.png`);

    await prisma.clientSettings.update({
      where: { clientId },
      data: { logoUrl: s3Url },
    });
    invalidateClientSettingsCache(clientId);

    const sid = spreadsheetId?.trim();
    if (sid) {
      await syncLogoUrlOnlyToSettingsSheet(sid, s3Url);
    }

    logInfo('Logo: persisted to S3', { clientId, s3UrlPreview: s3Url.slice(0, 96) });
  } catch (e) {
    logWarn('Logo processing failed, keeping original logoUrl', {
      clientId,
      errorMessage: serializeError(e).message,
    });
  }
}
